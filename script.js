// Configuration API
const API_BASE_URL = 'https://fiableauto-production-production.up.railway.app/api';

class FiableAutoApp {
    constructor() {
        this.currentSection = 'gestionnaire';
        this.currentMission = null;

        // Workflow principal : départ → arrivée
        this.currentPhase = 'departure';  // 'departure' | 'arrival' | 'completed'
        this.departureValidated = false;  // EDL Départ validé
        
        // Photos organisées par phase
        this.uploadedPhotos = {
            departure: {},
            arrival: {}
        };
        this.previewsDataURL = {
            departure: {},
            arrival: {}
        };

        // Signature et données
        this.signatureData = null;
        this.isDrawing = false;
        this.checklistData = {};

        // Photos obligatoires par phase
        this.requiredDeparturePhotos = [
            'compteur', 'face-avant', 'face-arriere',
            'lateral-gauche-avant', 'lateral-gauche-arriere',
            'lateral-droit-avant', 'lateral-droit-arriere',
            'moteur', 'interieur', 'carnet'
        ];
        this.requiredArrivalPhotos = [
            'compteur-final', 'etat-final', 'remise-cles'
        ];

        // Liste de toutes les missions pour filtrage
        this.allMissions = [];
        this.currentFilter = 'all'; // 'all', 'pending', 'in_progress', 'completed'

        this.init();
    }

    init() {
        this.setupNavigation();
        this.setupForms();
        this.setupChecklist();
        this.setupPhotoUpload();
        this.setupDepartureValidation();
        this.setupArrivalFinalization();
        this.setupSignature();
        this.setupCompletionScreen();
        this.setupStatsButtons(); // NOUVEAU : Boutons stats cliquables

        this.checkApiConnection();
        this.loadStats();
        this.loadAllMissions();
        this.setupPWA();
        this.initializeEnhancedFeatures();
    }

    // ========== NAVIGATION (Séparation stricte des accès) ==========
    setupNavigation() {
        const navPills = document.querySelectorAll('.nav-pill');
        const sections = document.querySelectorAll('.section');
        
        navPills.forEach(pill => {
            pill.addEventListener('click', () => {
                const target = pill.dataset.section;
                
                navPills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                sections.forEach(s => s.classList.remove('active'));
                document.getElementById(target).classList.add('active');
                this.currentSection = target;

                // Reset des états lors du changement de section
                this.resetSectionState();
            });
        });
    }

    resetSectionState() {
        if (this.currentSection === 'prestataire') {
            // Reset du formulaire d'accès
            const accessForm = document.getElementById('accessForm');
            if (accessForm) accessForm.reset();
            
            // Masquer les détails de mission si on revient à l'accueil prestataire
            const missionDetails = document.getElementById('missionDetails');
            if (missionDetails) missionDetails.style.display = 'none';
            
            // Reset des données de mission
            this.resetMissionData();
        }

        if (this.currentSection === 'client') {
            // Reset du formulaire de suivi
            const trackingForm = document.getElementById('trackingForm');
            if (trackingForm) trackingForm.reset();
            
            // Masquer les résultats de suivi
            const trackingResult = document.getElementById('trackingResult');
            if (trackingResult) trackingResult.style.display = 'none';
        }
    }

    resetMissionData() {
        this.currentMission = null;
        this.departureValidated = false;
        this.currentPhase = 'departure';
        this.uploadedPhotos = { departure: {}, arrival: {} };
        this.previewsDataURL = { departure: {}, arrival: {} };
        this.signatureData = null;
        this.checklistData = {};
    }

    // ========== STATS BUTTONS (NOUVEAU) ==========
    setupStatsButtons() {
        // Rendre les boutons stats cliquables
        const statsButtons = [
            { id: 'totalMissions', filter: 'all' },
            { id: 'pendingMissions', filter: 'pending' },
            { id: 'progressMissions', filter: 'in_progress' },
            { id: 'completedMissions', filter: 'completed' }
        ];

        statsButtons.forEach(({ id, filter }) => {
            const element = document.getElementById(id);
            if (element && element.parentElement) {
                const card = element.parentElement;
                card.style.cursor = 'pointer';
                card.classList.add('stats-clickable');
                
                card.addEventListener('click', () => {
                    this.filterMissions(filter);
                    this.highlightActiveFilter(card);
                });
            }
        });
    }

    filterMissions(filter) {
        this.currentFilter = filter;
        let filteredMissions = [...this.allMissions];

        if (filter !== 'all') {
            filteredMissions = this.allMissions.filter(mission => mission.status === filter);
        }

        this.displayMissionsList(filteredMissions);
        
        // Message de feedback
        const filterText = {
            'all': 'toutes les missions',
            'pending': 'les missions en attente',
            'in_progress': 'les missions en cours',
            'completed': 'les missions terminées'
        };
        
        this.showNotification(`Affichage de ${filterText[filter]} (${filteredMissions.length} résultat${filteredMissions.length > 1 ? 's' : ''})`, 'info');
    }

    highlightActiveFilter(activeCard) {
        // Retirer la classe active de toutes les cards stats
        document.querySelectorAll('.stat-card').forEach(card => {
            card.classList.remove('active-filter');
        });
        
        // Ajouter la classe active à la card cliquée
        activeCard.classList.add('active-filter');
    }

    // ========== FORMS ==========
    setupForms() {
        this.setupMissionForm();
        this.setupAccessForm();
        this.setupTrackingForm();
    }

    setupMissionForm() {
        const form = document.getElementById('missionForm');
        if (!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.createMission();
        });
        this.setupFormValidation(form);
    }

    setupFormValidation(form) {
        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => input.addEventListener('blur', () => this.validateField(input)));
    }

    validateField(field) {
        const value = field.value.trim();
        const required = field.hasAttribute('required');
        field.style.borderColor = (required && !value) ? '#dc3545' : '#ddd';
        return !(required && !value);
    }

    setupAccessForm() {
        const form = document.getElementById('accessForm');
        if (!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const code = document.getElementById('missionCode').value.trim();
            if (!code) {
                this.showNotification('Veuillez saisir un code mission', 'warning');
                return;
            }
            await this.accessMission(code);
        });
    }

    setupTrackingForm() {
        const form = document.getElementById('trackingForm');
        if (!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const code = document.getElementById('trackingCode').value.trim();
            if (!code) {
                this.showNotification('Veuillez saisir un code mission', 'warning');
                return;
            }
            await this.trackMission(code);
        });
    }

    // ========== CHECKLIST ==========
    setupChecklist() {
        const checkboxes = document.querySelectorAll('#checklist input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.checklistData[e.target.name] = e.target.checked;
                this.updateDepartureValidationButton();
            });
        });
    }

    isChecklistComplete() {
        const requiredChecks = ['vehiclePapers', 'gps', 'sdCard', 'safetyKit', 'spareWheel'];
        return requiredChecks.every(key => this.checklistData[key] === true);
    }

    // ========== VALIDATION EDL DÉPART ==========
    setupDepartureValidation() {
        const validateBtn = document.getElementById('validateDeparture');
        if (!validateBtn) return;

        validateBtn.addEventListener('click', async () => {
            if (!this.canValidateDeparture().valid) {
                this.showNotification(this.canValidateDeparture().message, 'warning');
                return;
            }

            try {
                this.showLoading(true);
                
                // Sauvegarder les données de départ
                await this.saveDepartureData();
                
                // Marquer comme validé
                this.departureValidated = true;
                
                // Verrouiller les photos de départ
                this.lockDeparturePhotos();
                
                // Passer à la phase arrivée
                this.switchToArrivalPhase();
                
                // Mettre à jour le statut de la mission
                if (this.currentMission) {
                    await this.apiCall(`/missions/${this.currentMission.id}/status`, {
                        method: 'PUT',
                        body: JSON.stringify({ status: 'departure_validated' })
                    });
                }
                
                this.showNotification('✅ EDL Départ validé ! Vous pouvez maintenant procéder à l\'arrivée.', 'success');
                
            } catch (error) {
                console.error('Erreur validation départ:', error);
                this.showNotification('Erreur lors de la validation du départ', 'error');
            } finally {
                this.showLoading(false);
            }
        });
    }

    canValidateDeparture() {
        if (!this.isChecklistComplete()) {
            return {
                valid: false,
                message: 'Checklist incomplète. Veuillez cocher toutes les cases requises.'
            };
        }

        const missingPhotos = this.requiredDeparturePhotos.filter(
            photo => !this.uploadedPhotos.departure[photo]
        );
        
        if (missingPhotos.length > 0) {
            return {
                valid: false,
                message: `Photos de départ manquantes : ${missingPhotos.join(', ')}`
            };
        }

        return { valid: true };
    }

    updateDepartureValidationButton() {
        const validateBtn = document.getElementById('validateDeparture');
        if (!validateBtn) return;

        const canValidate = this.canValidateDeparture().valid;
        validateBtn.disabled = !canValidate || this.departureValidated;
        
        if (this.departureValidated) {
            validateBtn.innerHTML = '<i class="fas fa-check"></i> Départ Validé';
            validateBtn.classList.add('validated');
        }
    }

    lockDeparturePhotos() {
        const departureSection = document.getElementById('departurePhase');
        if (!departureSection) return;

        const photoInputs = departureSection.querySelectorAll('input[type="file"]');
        photoInputs.forEach(input => {
            input.disabled = true;
            const card = input.closest('.photo-card');
            if (card) {
                card.classList.add('locked');
                const label = card.querySelector('label');
                if (label) label.style.opacity = '0.6';
            }
        });

        const checkboxes = departureSection.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => checkbox.disabled = true);

        const observations = document.getElementById('departureObservations');
        if (observations) observations.disabled = true;
    }

    // ✅ NOUVEAU : Fonction modifiée avec scroll automatique
    switchToArrivalPhase() {
        const departurePhase = document.getElementById('departurePhase');
        const arrivalPhase = document.getElementById('arrivalPhase');
        
        if (departurePhase) departurePhase.style.opacity = '0.6';
        if (arrivalPhase) {
            arrivalPhase.style.display = 'block';
            
            // ✅ NOUVEAU : Scroll automatique vers la phase arrivée
            setTimeout(() => {
                arrivalPhase.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'start' 
                });
            }, 300); // Petit délai pour laisser l'affichage se faire
        }
        
        this.currentPhase = 'arrival';
        
        // ✅ BONUS : Notification visuelle du changement de phase
        this.showNotification('📍 Passage à la phase d\'arrivée', 'info');
    }

    async saveDepartureData() {
        if (!this.currentMission) return;

        const departureObservations = document.getElementById('departureObservations')?.value || '';
        
        const payload = {
            phase: 'departure',
            observations: departureObservations,
            checklist: this.checklistData,
            photos: Object.keys(this.uploadedPhotos.departure),
            timestamp: new Date().toISOString()
        };

        await this.apiCall(`/missions/${this.currentMission.id}/departure-data`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    // ========== PHOTOS (CORRIGÉ MOBILE) ==========
    setupPhotoUpload() {
        // Photos de départ
        const departureInputs = document.querySelectorAll('#departurePhotos input[type="file"]');
        departureInputs.forEach(input => {
            // CORRECTION MOBILE : Ajouter les attributs nécessaires
            input.setAttribute('accept', 'image/*');
            input.setAttribute('capture', 'environment'); // Utilise la caméra arrière par défaut
            
            input.addEventListener('change', (e) => this.handlePhotoUpload(e, 'departure'));
        });

        // Photos d'arrivée
        const arrivalInputs = document.querySelectorAll('#arrivalPhotos input[type="file"]');
        arrivalInputs.forEach(input => {
            // CORRECTION MOBILE : Ajouter les attributs nécessaires
            input.setAttribute('accept', 'image/*');
            input.setAttribute('capture', 'environment');
            
            input.addEventListener('change', (e) => this.handlePhotoUpload(e, 'arrival'));
        });
    }

    async handlePhotoUpload(event, phase) {
        const file = event.target.files[0];
        if (!file) return;

        const photoType = event.target.dataset.photo;
        if (!photoType) {
            this.showNotification('Erreur : type de photo non défini', 'error');
            return;
        }

        // Vérifier si on peut modifier les photos de départ
        if (phase === 'departure' && this.departureValidated) {
            this.showNotification('Les photos de départ sont verrouillées après validation', 'warning');
            event.target.value = '';
            return;
        }

        const card = event.target.closest('.photo-card');
        const preview = card.querySelector('.photo-preview');
        const uploadStatus = card.querySelector('.upload-status');

        try {
            this.showLoading(true);

            // Validation du fichier
            if (!file.type.startsWith('image/')) {
                throw new Error('Le fichier doit être une image');
            }

            // Taille max 10MB
            if (file.size > 10 * 1024 * 1024) {
                throw new Error('L\'image est trop volumineuse (max 10MB)');
            }

            // Compression de l'image (AMÉLIORÉE POUR MOBILE)
            const compressedFile = await this.compressImageForMobile(file);

            // Prévisualisation locale
            const reader = new FileReader();
            reader.onload = (e) => {
                if (preview) {
                    preview.src = e.target.result;
                    preview.style.display = 'block';
                }
                this.previewsDataURL[phase][photoType] = e.target.result;
            };
            reader.readAsDataURL(compressedFile);

            // Upload vers le serveur (CORRIGÉ)
            if (this.currentMission) {
                const photoTypeWithPhase = `${phase}:${photoType}`; // Format attendu par l'API
                await this.uploadPhotoToServer(this.currentMission.id, photoTypeWithPhase, compressedFile);
                
                // Marquer comme uploadée
                this.uploadedPhotos[phase][photoType] = true;
                card.classList.add('uploaded');
                
                if (uploadStatus) {
                    uploadStatus.innerHTML = '<i class="fas fa-check" style="color: var(--success-green);"></i>';
                }
            } else {
                // Mode hors ligne - stockage local
                this.uploadedPhotos[phase][photoType] = compressedFile;
            }

            // Mettre à jour les boutons de validation/finalisation
            if (phase === 'departure') {
                this.updateDepartureValidationButton();
            } else if (phase === 'arrival') {
                this.updateFinalizationButton();
            }

            this.showNotification(`📸 Photo ${photoType} uploadée avec succès`, 'success');

        } catch (error) {
            console.error('Erreur upload photo:', error);
            this.showNotification(`Erreur upload photo: ${error.message}`, 'error');
            
            if (uploadStatus) {
                uploadStatus.innerHTML = '<i class="fas fa-times" style="color: var(--danger-red);"></i>';
            }
            
            // Reset l'input en cas d'erreur
            event.target.value = '';
        } finally {
            this.showLoading(false);
        }
    }

    // NOUVELLE FONCTION : Compression optimisée pour mobile
    async compressImageForMobile(file, maxWidth = 1200, maxHeight = 1200, quality = 0.8) {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                try {
                    // Calcul des dimensions en gardant le ratio
                    const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
                    const width = Math.round(img.width * ratio);
                    const height = Math.round(img.height * ratio);
                    
                    canvas.width = width;
                    canvas.height = height;
                    
                    // Amélioration de la qualité de rendu
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    
                    // Fond blanc pour les JPEGs
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, width, height);
                    
                    // Dessiner l'image
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // Convertir en blob avec qualité adaptative
                    canvas.toBlob((blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Impossible de compresser l\'image'));
                        }
                    }, 'image/jpeg', quality);
                    
                } catch (error) {
                    reject(error);
                }
            };
            
            img.onerror = () => {
                reject(new Error('Impossible de charger l\'image'));
            };
            
            img.src = URL.createObjectURL(file);
        });
    }

    // FONCTION CORRIGÉE : Upload vers serveur
    async uploadPhotoToServer(missionId, photoType, file) {
        const formData = new FormData();
        formData.append('photo', file);
        formData.append('photoType', photoType);
        
        const response = await fetch(`${API_BASE_URL}/uploads/photos/${missionId}`, {
            method: 'POST',
            body: formData,
            // Pas de Content-Type header avec FormData - le navigateur le gère automatiquement
        });
        
        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`Erreur serveur ${response.status}: ${errorData}`);
        }
        
        return response.json();
    }

    // ========== SIGNATURE (Arrivée uniquement) ==========
    setupSignature() {
        const canvas = document.getElementById('signatureCanvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3; // Ligne plus épaisse pour mobile
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Support tactile amélioré
        let isDrawing = false;
        let lastPoint = null;

        const getEventPoint = (e) => {
            const rect = canvas.getBoundingClientRect();
            const touch = e.touches ? e.touches[0] : e;
            return {
                x: (touch.clientX - rect.left) * (canvas.width / rect.width),
                y: (touch.clientY - rect.top) * (canvas.height / rect.height)
            };
        };

        const startDrawing = (e) => {
            e.preventDefault();
            isDrawing = true;
            lastPoint = getEventPoint(e);
            ctx.beginPath();
            ctx.moveTo(lastPoint.x, lastPoint.y);
        };

        const draw = (e) => {
            if (!isDrawing) return;
            e.preventDefault();
            
            const currentPoint = getEventPoint(e);
            ctx.lineTo(currentPoint.x, currentPoint.y);
            ctx.stroke();
            lastPoint = currentPoint;
        };

        const stopDrawing = (e) => {
            if (!isDrawing) return;
            e.preventDefault();
            isDrawing = false;
            this.signatureData = canvas.toDataURL('image/png');
            this.updateFinalizationButton();
        };

        // Events tactiles (mobile)
        canvas.addEventListener('touchstart', startDrawing, { passive: false });
        canvas.addEventListener('touchmove', draw, { passive: false });
        canvas.addEventListener('touchend', stopDrawing, { passive: false });

        // Events souris (desktop)
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseleave', stopDrawing);

        // Empêcher le scroll sur le canvas
        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
        }, { passive: false });

        // Bouton effacer
        const clearBtn = document.getElementById('clearSignature');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                this.signatureData = null;
                this.updateFinalizationButton();
            });
        }
    }

    // ========== FINALISATION MISSION ==========
    setupArrivalFinalization() {
        const finalizeBtn = document.getElementById('finalizeMission');
        if (!finalizeBtn) return;

        finalizeBtn.addEventListener('click', async () => {
            if (!this.canFinalizeMission().valid) {
                this.showNotification(this.canFinalizeMission().message, 'warning');
                return;
            }

            try {
                this.showLoading(true);
                
                // Sauvegarder les données d'arrivée
                await this.saveArrivalData();
                
                // Mettre à jour le statut à 'completed'
                if (this.currentMission) {
                    await this.apiCall(`/missions/${this.currentMission.id}/status`, {
                        method: 'PUT',
                        body: JSON.stringify({ status: 'completed' })
                    });
                }
                
                // Afficher l'écran de completion
                this.showCompletionScreen();
                
                this.currentPhase = 'completed';
                this.showNotification('🎉 Mission finalisée avec succès !', 'success');
                
            } catch (error) {
                console.error('Erreur finalisation mission:', error);
                this.showNotification('Erreur lors de la finalisation de la mission', 'error');
            } finally {
                this.showLoading(false);
            }
        });
    }

    canFinalizeMission() {
        if (!this.departureValidated) {
            return {
                valid: false,
                message: 'Vous devez d\'abord valider l\'EDL Départ'
            };
        }

        const missingArrivalPhotos = this.requiredArrivalPhotos.filter(
            photo => !this.uploadedPhotos.arrival[photo]
        );
        
        if (missingArrivalPhotos.length > 0) {
            return {
                valid: false,
                message: `Photos d'arrivée manquantes : ${missingArrivalPhotos.join(', ')}`
            };
        }

        if (!this.signatureData) {
            return {
                valid: false,
                message: 'La signature du client est requise'
            };
        }

        return { valid: true };
    }

    updateFinalizationButton() {
        const finalizeBtn = document.getElementById('finalizeMission');
        if (!finalizeBtn) return;

        const canFinalize = this.canFinalizeMission().valid;
        finalizeBtn.disabled = !canFinalize;
        
        if (canFinalize) {
            finalizeBtn.classList.add('ready');
        } else {
            finalizeBtn.classList.remove('ready');
        }
    }

    async saveArrivalData() {
        if (!this.currentMission) return;

        const arrivalObservations = document.getElementById('arrivalObservations')?.value || '';
        
        const payload = {
            phase: 'arrival',
            observations: arrivalObservations,
            signature: this.signatureData,
            photos: Object.keys(this.uploadedPhotos.arrival),
            timestamp: new Date().toISOString()
        };

        await this.apiCall(`/missions/${this.currentMission.id}/arrival-data`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    // ========== ÉCRAN DE COMPLETION ==========
    setupCompletionScreen() {
        const returnBtn = document.getElementById('returnToHome');
        if (!returnBtn) return;

        returnBtn.addEventListener('click', () => {
            this.returnToHomePrestataire();
        });
    }

    showCompletionScreen() {
        const completionScreen = document.getElementById('completionScreen');
        const missionDetails = document.getElementById('missionDetails');
        
        if (missionDetails) missionDetails.style.display = 'none';
        if (completionScreen) {
            completionScreen.style.display = 'block';
            completionScreen.scrollIntoView({ behavior: 'smooth' });
        }
    }

    returnToHomePrestataire() {
        // Reset complet
        this.resetMissionData();

        // Masquer les écrans de détails
        const missionDetails = document.getElementById('missionDetails');
        const completionScreen = document.getElementById('completionScreen');
        
        if (missionDetails) missionDetails.style.display = 'none';
        if (completionScreen) completionScreen.style.display = 'none';

        // Reset des formulaires
        const accessForm = document.getElementById('accessForm');
        if (accessForm) accessForm.reset();

        // Reset des phases UI
        const departurePhase = document.getElementById('departurePhase');
        const arrivalPhase = document.getElementById('arrivalPhase');
        
        if (departurePhase) {
            departurePhase.style.opacity = '1';
            // Réactiver les contrôles
            departurePhase.querySelectorAll('input, textarea').forEach(el => {
                el.disabled = false;
            });
            departurePhase.querySelectorAll('.photo-card').forEach(card => {
                card.classList.remove('locked', 'uploaded');
            });
        }
        
        if (arrivalPhase) {
            arrivalPhase.style.display = 'none';
        }

        // Reset boutons
        const validateBtn = document.getElementById('validateDeparture');
        if (validateBtn) {
            validateBtn.disabled = true;
            validateBtn.innerHTML = '<i class="fas fa-check"></i> Valider Départ';
            validateBtn.classList.remove('validated');
        }

        // Clear signature canvas
        const canvas = document.getElementById('signatureCanvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        // Scroll vers le haut
        window.scrollTo({ top: 0, behavior: 'smooth' });

        this.showNotification('Retour à l\'accueil prestataire', 'info');
    }

    // ========== API ==========
    async apiCall(endpoint, options = {}) {
        const url = `${API_BASE_URL}${endpoint}`;
        const fetchOptions = {
            headers: {
                ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
                ...(options.headers || {})
            },
            ...options
        };
        
        const response = await fetch(url, fetchOptions);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    }

    async checkApiConnection() {
        const statusEl = document.getElementById('connectionStatus');
        if (!statusEl) return;

        try {
            await this.apiCall('/health');
            statusEl.innerHTML = '<i class="fas fa-wifi"></i> 🟢 Connecté';
            statusEl.className = 'connection-status online';
        } catch {
            statusEl.innerHTML = '<i class="fas fa-wifi"></i> 🔴 Hors ligne';
            statusEl.className = 'connection-status offline';
        }
    }

    // ========== MISSIONS ==========
    async createMission() {
        this.showLoading(true);
        try {
            const formData = new FormData(document.getElementById('missionForm'));
            const data = {
                vehicleBrand: formData.get('vehicleBrand'),
                vehicleModel: formData.get('vehicleModel'),
                vehicleYear: formData.get('vehicleYear'),
                licensePlate: formData.get('licensePlate'),
                mileage: formData.get('mileage'),
                pickupLocation: formData.get('pickupLocation'),
                deliveryLocation: formData.get('deliveryLocation'),
                pickupDate: formData.get('pickupDate'),
                deliveryDate: formData.get('deliveryDate'),
                clientName: formData.get('clientName'),
                clientEmail: formData.get('clientEmail'),
                clientPhone: formData.get('clientPhone')
            };

            await this.apiCall('/missions', {
                method: 'POST',
                body: JSON.stringify(data)
            });

            this.showNotification('Mission créée avec succès! 🎉', 'success');
            document.getElementById('missionForm').reset();
            this.loadStats();
            this.loadAllMissions();

        } catch (error) {
            console.error('Erreur création mission:', error);
            this.showNotification('Erreur lors de la création de la mission', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async accessMission(code) {
        this.showLoading(true);
        try {
            const response = await this.apiCall(`/missions/${code}`);
            this.currentMission = response.data || response;
            
            this.displayMissionDetails(this.currentMission);
            this.showNotification('Mission chargée avec succès! ✅', 'success');

            // Marquer la mission comme "en cours" si ce n'est pas déjà fait
            if (this.currentMission.status === 'pending') {
                try {
                    await this.apiCall(`/missions/${this.currentMission.id}/status`, {
                        method: 'PUT',
                        body: JSON.stringify({ status: 'in_progress' })
                    });
                } catch (e) {
                    console.warn('Impossible de mettre à jour le statut:', e);
                }
            }

        } catch (error) {
            console.error('Erreur accès mission:', error);
            this.showNotification('Mission introuvable ❌', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async trackMission(code) {
        this.showLoading(true);
        try {
            const response = await this.apiCall(`/missions/${code}`);
            const mission = response.data || response;
            
            this.displayTrackingInfo(mission);
            this.updateProgressTracker(mission.status);
            this.showNotification('Mission trouvée! ✅', 'success');

        } catch (error) {
            console.error('Erreur suivi mission:', error);
            this.showNotification('Mission introuvable ❌', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    displayMissionDetails(mission) {
        const missionDetails = document.getElementById('missionDetails');
        const missionInfo = document.getElementById('missionInfo');
        
        if (!missionDetails || !missionInfo) return;

        missionInfo.innerHTML = `
            <div class="mission-info-card">
                <h3><i class="fas fa-clipboard-check"></i> Détails de la Mission</h3>
                <div class="info-grid">
                    <div class="info-item">
                        <strong>🚗 Véhicule:</strong>
                        <span>${mission.vehicle_brand} ${mission.vehicle_model}${mission.vehicle_year ? ' (' + mission.vehicle_year + ')' : ''}</span>
                    </div>
                    <div class="info-item">
                        <strong>🔢 Immatriculation:</strong>
                        <span>${mission.license_plate || 'N/A'}</span>
                    </div>
                    <div class="info-item">
                        <strong>👤 Client:</strong>
                        <span>${mission.client_name}</span>
                    </div>
                    <div class="info-item">
                        <strong>📋 Code Mission:</strong>
                        <span class="mission-code">${mission.mission_code}</span>
                    </div>
                    <div class="info-item">
                        <strong>📍 Prise en charge:</strong>
                        <span>${mission.pickup_location}</span>
                    </div>
                    <div class="info-item">
                        <strong>🎯 Livraison:</strong>
                        <span>${mission.delivery_location}</span>
                    </div>
                </div>
            </div>
        `;

        missionDetails.style.display = 'block';
        
        // Réinitialiser les phases selon le statut de la mission
        this.initializePhasesFromMissionStatus(mission.status);
    }

    initializePhasesFromMissionStatus(status) {
        const departurePhase = document.getElementById('departurePhase');
        const arrivalPhase = document.getElementById('arrivalPhase');

        if (status === 'departure_validated' || status === 'completed') {
            this.departureValidated = true;
            this.lockDeparturePhotos();
            
            if (departurePhase) departurePhase.style.opacity = '0.6';
            if (arrivalPhase) arrivalPhase.style.display = 'block';
            
            this.currentPhase = status === 'completed' ? 'completed' : 'arrival';
        } else {
            if (departurePhase) departurePhase.style.opacity = '1';
            if (arrivalPhase) arrivalPhase.style.display = 'none';
            
            this.currentPhase = 'departure';
        }

        if (status === 'completed') {
            this.showCompletionScreen();
        }
    }

    displayTrackingInfo(mission) {
        const trackingResult = document.getElementById('trackingResult');
        const trackingInfo = document.getElementById('trackingInfo');
        
        if (!trackingResult || !trackingInfo) return;

        trackingInfo.innerHTML = `
            <div class="tracking-info-card">
                <h3><i class="fas fa-route"></i> Suivi de Mission</h3>
                <div class="info-grid">
                    <div class="info-item">
                        <strong>🚗 Véhicule:</strong>
                        <span>${mission.vehicle_brand} ${mission.vehicle_model}</span>
                    </div>
                    <div class="info-item">
                        <strong>📊 Statut:</strong>
                        <span class="status-badge status-${mission.status}">${this.getStatusText(mission.status)}</span>
                    </div>
                    <div class="info-item">
                        <strong>📅 Date création:</strong>
                        <span>${new Date(mission.created_at).toLocaleDateString('fr-FR')}</span>
                    </div>
                    <div class="info-item">
                        <strong>📋 Code Mission:</strong>
                        <span class="mission-code">${mission.mission_code}</span>
                    </div>
                </div>
            </div>
        `;

        trackingResult.style.display = 'block';

        // Afficher la section rapport si mission terminée
        if (mission.status === 'completed') {
            const downloadSection = document.getElementById('downloadSection');
            if (downloadSection) {
                downloadSection.style.display = 'block';
                
                const downloadBtn = document.getElementById('downloadReport');
                const emailBtn = document.getElementById('emailReport');
                
                if (downloadBtn) {
                    downloadBtn.onclick = () => this.downloadReport(mission.id);
                }
                
                if (emailBtn) {
                    emailBtn.onclick = () => this.sendReportByEmail(mission.id);
                }
            }
        }
    }

    updateProgressTracker(status) {
        const progressSteps = document.querySelectorAll('#progressTracker .progress-step');
        
        const statusMap = {
            'pending': 'created',
            'in_progress': 'in-progress',
            'departure_validated': 'departure-validated',
            'completed': 'completed'
        };

        const currentStep = statusMap[status] || 'created';
        const stepOrder = ['created', 'in-progress', 'departure-validated', 'completed'];
        const currentIndex = stepOrder.indexOf(currentStep);

        progressSteps.forEach((step, index) => {
            step.classList.remove('active', 'completed');
            
            if (index < currentIndex) {
                step.classList.add('completed');
            } else if (index === currentIndex) {
                step.classList.add('active');
            }
        });
    }

    // ========== DASHBOARD & STATS ==========
    async loadStats() {
        try {
            const response = await this.apiCall('/stats');
            const stats = response.data || response;
            
            const elements = {
                totalMissions: document.getElementById('totalMissions'),
                pendingMissions: document.getElementById('pendingMissions'),
                completedMissions: document.getElementById('completedMissions'),
                progressMissions: document.getElementById('progressMissions')
            };

            if (elements.totalMissions) elements.totalMissions.textContent = stats.total || 0;
            if (elements.pendingMissions) elements.pendingMissions.textContent = stats.pending || 0;
            if (elements.completedMissions) elements.completedMissions.textContent = stats.completed || 0;
            if (elements.progressMissions) elements.progressMissions.textContent = stats.in_progress || 0;

        } catch (error) {
            console.error('Erreur chargement stats:', error);
        }
    }

    async loadAllMissions() {
        try {
            const response = await this.apiCall('/missions');
            const missions = response.data || [];
            this.allMissions = missions; // Stocker pour le filtrage
            this.displayMissionsList(missions);
        } catch (error) {
            console.error('Erreur chargement missions:', error);
        }
    }

    displayMissionsList(missions) {
        const missionsList = document.getElementById('missionsList');
        if (!missionsList) return;

        if (!missions.length) {
            const filterText = this.currentFilter === 'all' ? '' : ` avec le statut "${this.getStatusText(this.currentFilter)}"`;
            missionsList.innerHTML = `
                <div class="no-missions">
                    <i class="fas fa-inbox"></i>
                    <p>Aucune mission trouvée${filterText}</p>
                    ${this.currentFilter !== 'all' ? '<button class="btn-enhanced btn-secondary" onclick="app.filterMissions(\'all\')">Voir toutes les missions</button>' : ''}
                </div>
            `;
            return;
        }

        missionsList.innerHTML = missions.map(mission => `
            <div class="mission-card">
                <div class="mission-header">
                    <h4>${mission.vehicle_brand} ${mission.vehicle_model}</h4>
                    <span class="status-badge status-${mission.status}">
                        ${this.getStatusText(mission.status)}
                    </span>
                </div>
                
                <div class="mission-body">
                    <div class="mission-info">
                        <p><strong>Code:</strong> ${mission.mission_code}</p>
                        <p><strong>Client:</strong> ${mission.client_name}</p>
                        <p><strong>Email:</strong> ${mission.client_email}</p>
                        <p><strong>Téléphone:</strong> ${mission.client_phone || 'N/A'}</p>
                        <p><strong>Créée le:</strong> ${new Date(mission.created_at).toLocaleDateString('fr-FR')}</p>
                        <p><strong>De:</strong> ${mission.pickup_location}</p>
                        <p><strong>Vers:</strong> ${mission.delivery_location}</p>
                    </div>
                </div>
                
                <div class="mission-actions">
                    <button onclick="app.switchToPrestataire('${mission.mission_code}')" class="btn-enhanced btn-secondary">
                        <i class="fas fa-user-cog"></i> Interface Prestataire
                    </button>
                    <button onclick="app.switchToClient('${mission.mission_code}')" class="btn-enhanced btn-secondary">
                        <i class="fas fa-user"></i> Suivi Client
                    </button>
                    ${mission.status === 'completed' ? `
                        <button onclick="app.downloadReport(${mission.id})" class="btn-enhanced btn-success">
                            <i class="fas fa-file-pdf"></i> Télécharger Rapport
                        </button>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }

    // ========== NAVIGATION HELPER METHODS ==========
    switchToPrestataire(missionCode) {
        const prestataireTab = document.querySelector('[data-section="prestataire"]');
        if (prestataireTab) {
            prestataireTab.click();
            
            setTimeout(() => {
                const missionCodeInput = document.getElementById('missionCode');
                const accessForm = document.getElementById('accessForm');
                
                if (missionCodeInput && accessForm) {
                    missionCodeInput.value = missionCode;
                    accessForm.dispatchEvent(new Event('submit'));
                }
            }, 100);
        }
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    switchToClient(missionCode) {
        const clientTab = document.querySelector('[data-section="client"]');
        if (clientTab) {
            clientTab.click();
            
            setTimeout(() => {
                const trackingCodeInput = document.getElementById('trackingCode');
                const trackingForm = document.getElementById('trackingForm');
                
                if (trackingCodeInput && trackingForm) {
                    trackingCodeInput.value = missionCode;
                    trackingForm.dispatchEvent(new Event('submit'));
                }
            }, 100);
        }
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ========== RAPPORTS PDF (CORRIGÉ) ==========
    async downloadReport(missionId) {
        try {
            this.showLoading(true);
            
            // Appel API corrigé
            const response = await fetch(`${API_BASE_URL}/reports/${missionId}/pdf`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/pdf'
                }
            });
            
            if (!response.ok) {
                throw new Error(`Erreur serveur ${response.status}: ${response.statusText}`);
            }
            
            // Vérifier que c'est bien un PDF
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/pdf')) {
                throw new Error('Le serveur n\'a pas renvoyé un fichier PDF valide');
            }
            
            const blob = await response.blob();
            
            // Créer un nom de fichier avec la date
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
            const fileName = `rapport-mission-${missionId}-${dateStr}.pdf`;
            
            // Téléchargement avec vérification mobile/desktop
            if (window.navigator && window.navigator.msSaveOrOpenBlob) {
                // Support IE/Edge legacy
                window.navigator.msSaveOrOpenBlob(blob, fileName);
            } else {
                // Méthode standard
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                
                link.href = url;
                link.download = fileName;
                link.style.display = 'none';
                
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                // Nettoyer l'URL après un délai
                setTimeout(() => {
                    URL.revokeObjectURL(url);
                }, 1000);
            }
            
            this.showNotification('📄 Rapport téléchargé avec succès !', 'success');
            
        } catch (error) {
            console.error('Erreur téléchargement rapport:', error);
            this.showNotification(`Erreur téléchargement: ${error.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async sendReportByEmail(missionId) {
        const email = prompt('Entrez l\'adresse email de destination:');
        if (!email) return;
        
        if (!this.isValidEmail(email)) {
            this.showNotification('Adresse email invalide', 'warning');
            return;
        }

        try {
            this.showLoading(true);
            
            await this.apiCall(`/reports/${missionId}/email`, {
                method: 'POST',
                body: JSON.stringify({ email: email })
            });
            
            this.showNotification(`📧 Rapport envoyé avec succès à ${email} !`, 'success');
            
        } catch (error) {
            console.error('Erreur envoi email:', error);
            this.showNotification('Erreur lors de l\'envoi du rapport par email', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // ========== UTILS ==========
    getStatusText(status) {
        const statusMap = {
            'pending': 'En attente',
            'assigned': 'Assignée',
            'in_progress': 'En cours',
            'departure_validated': 'Départ validé',
            'completed': 'Terminée',
            'cancelled': 'Annulée'
        };
        
        return statusMap[status] || status;
    }

    showLoading(show) {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = show ? 'flex' : 'none';
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        if (!notification) {
            // Fallback si pas d'élément notification
            if (type === 'error') {
                alert(`❌ ${message}`);
            } else if (type === 'success') {
                console.log(`✅ ${message}`);
            } else {
                console.log(`ℹ️ ${message}`);
            }
            return;
        }
        
        notification.textContent = message;
        notification.className = `notification ${type} show`;
        
        // Auto-hide après 4 secondes (sauf pour les erreurs)
        const hideDelay = type === 'error' ? 6000 : 4000;
        setTimeout(() => {
            notification.classList.remove('show');
        }, hideDelay);
    }

    // ========== PWA ==========
    setupPWA() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('SW registered:', registration);
                })
                .catch(error => {
                    console.log('SW registration failed:', error);
                });
        }

        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            this.showInstallPrompt(deferredPrompt);
        });
    }

    showInstallPrompt(deferredPrompt) {
        const installButton = document.createElement('button');
        installButton.className = 'btn-enhanced btn-primary install-prompt';
        installButton.innerHTML = '<i class="fas fa-download"></i> Installer l\'app';
        installButton.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        
        installButton.addEventListener('click', async () => {
            if (!deferredPrompt) {
                this.showNotification('Installation non disponible', 'info');
                return;
            }
            
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            
            if (outcome === 'accepted') {
                this.showNotification('Application installée avec succès!', 'success');
            }
            
            deferredPrompt = null;
            installButton.remove();
        });
        
        document.body.appendChild(installButton);
        
        // Auto-remove après 10 secondes
        setTimeout(() => {
            if (installButton.parentNode) {
                installButton.remove();
            }
        }, 10000);
    }

    // ========== ENHANCED FEATURES ==========
    initializeEnhancedFeatures() {
        this.setupAutoSave();
        this.loadThemePreference();
        this.setupKeyboardShortcuts();
        this.optimizeForMobile();
    }

    // NOUVEAU : Optimisations mobile
    optimizeForMobile() {
        // Détecter si on est sur mobile
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobile) {
            // Ajuster la viewport height pour mobile
            const setVH = () => {
                const vh = window.innerHeight * 0.01;
                document.documentElement.style.setProperty('--vh', `${vh}px`);
            };
            
            setVH();
            window.addEventListener('resize', setVH);
            window.addEventListener('orientationchange', setVH);

            // Améliorer les zones de toucher
            document.body.classList.add('mobile-optimized');
            
            // Empêcher le zoom sur les inputs
            const inputs = document.querySelectorAll('input, textarea, select');
            inputs.forEach(input => {
                input.addEventListener('focus', () => {
                    input.setAttribute('readonly', 'readonly');
                    input.setAttribute('onfocus', 'this.removeAttribute("readonly");');
                });
            });
        }
    }

    setupAutoSave() {
        const observationFields = [
            'departureObservations',
            'arrivalObservations'
        ];
        
        observationFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (!field) return;
            
            let autoSaveTimeout;
            field.addEventListener('input', () => {
                clearTimeout(autoSaveTimeout);
                autoSaveTimeout = setTimeout(() => {
                    this.autoSaveObservations(fieldId);
                }, 2000);
            });
        });
    }

    async autoSaveObservations(fieldId) {
        if (!this.currentMission) return;
        
        try {
            const field = document.getElementById(fieldId);
            if (!field) return;
            
            const observations = field.value;
            const phase = fieldId.includes('departure') ? 'departure' : 'arrival';
            
            await this.apiCall(`/missions/${this.currentMission.id}/observations`, {
                method: 'PUT',
                body: JSON.stringify({ 
                    phase: phase,
                    observations: observations 
                })
            });
            
            // Afficher indicateur de sauvegarde
            this.showSaveIndicator(field);
            
        } catch (error) {
            console.error('Erreur auto-save:', error);
        }
    }

    showSaveIndicator(field) {
        const indicator = document.createElement('span');
        indicator.innerHTML = '✅ Sauvegardé';
        indicator.className = 'save-indicator';
        indicator.style.cssText = `
            position: absolute;
            right: 10px;
            top: 10px;
            color: #28a745;
            font-size: 12px;
            background: white;
            padding: 2px 6px;
            border-radius: 3px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        `;
        
        const container = field.parentElement;
        container.style.position = 'relative';
        container.appendChild(indicator);
        
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.remove();
            }
        }, 2000);
    }

    loadThemePreference() {
        const savedTheme = localStorage.getItem('fiableauto-theme');
        if (savedTheme) {
            document.body.setAttribute('data-theme', savedTheme);
        }
    }

    toggleTheme() {
        const currentTheme = document.body.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('fiableauto-theme', newTheme);
        
        this.showNotification(`Mode ${newTheme === 'dark' ? 'sombre' : 'clair'} activé`, 'info');
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + S pour sauvegarder les observations
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                const activeElement = document.activeElement;
                if (activeElement && (activeElement.id === 'departureObservations' || activeElement.id === 'arrivalObservations')) {
                    this.autoSaveObservations(activeElement.id);
                    this.showNotification('Observations sauvegardées', 'success');
                }
            }
            
            // Echap pour fermer les modals/overlays
            if (e.key === 'Escape') {
                const loadingOverlay = document.getElementById('loadingOverlay');
                if (loadingOverlay && loadingOverlay.style.display === 'flex') {
                    this.showLoading(false);
                }
            }
        });
    }
}

// ========== FONCTIONS GLOBALES (pour compatibilité HTML onclick) ==========
window.toggleTheme = () => {
    if (window.app) {
        window.app.toggleTheme();
    }
};

window.getCurrentLocation = (inputId) => {
    if (window.app) {
        window.app.getCurrentLocation(inputId);
    }
};

// ========== INITIALISATION DE L'APPLICATION ==========
let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new FiableAutoApp();
    window.app = app;
    
    // Message de bienvenue
    setTimeout(() => {
        app.showNotification('🚗 FiableAuto initialisé avec succès!', 'success');
    }, 1000);
});

// ========== GESTION DES ERREURS ET ÉVÉNEMENTS RÉSEAU ==========
window.addEventListener('error', (event) => {
    console.error('Erreur application:', event.error);
    if (window.app) {
        window.app.showNotification('Une erreur inattendue s\'est produite', 'error');
    }
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Promesse rejetée:', event.reason);
    if (window.app) {
        window.app.showNotification('Erreur de connexion réseau', 'error');
    }
});

window.addEventListener('online', () => {
    if (window.app) {
        window.app.checkApiConnection();
        window.app.showNotification('Connexion Internet rétablie ✅', 'success');
    }
});

window.addEventListener('offline', () => {
    if (window.app) {
        window.app.showNotification('Mode hors ligne - Fonctionnalités limitées 📵', 'warning');
    }
});

// Service Worker messaging
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'SYNC_COMPLETE' && window.app) {
            window.app.showNotification('Données synchronisées ✅', 'success');
        }
    });
}
