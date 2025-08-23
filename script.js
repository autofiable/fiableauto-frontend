// Configuration API
const API_BASE_URL = 'https://fiableauto-production-production.up.railway.app/api';

// État global de l'application Enhanced
class FiableAutoApp {
    constructor() {
        this.currentSection = 'gestionnaire';
        this.currentMission = null;

        // >>> Nouveaux stockages par phase
        this.edlPhase = 'depart'; // 'depart' | 'arrivee'
        this.uploadedPhotos = { depart: {}, arrivee: {} };
        this.previewsDataURL = { depart: {}, arrivee: {} }; // pour rafraîchir l'UI quand on change de phase

        this.signatureData = null;
        this.isDrawing = false;

        // Checklist simple (commune) + clés
        this.checklistData = {};
        this.keyCount = 0;

        this.optionalPhotos = [];

        this.requiredPhotos = [
            'compteur',
            'face-avant',
            'face-arriere',
            'lateral-gauche-avant',
            'lateral-gauche-arriere',
            'lateral-droit-avant',
            'lateral-droit-arriere',
            'moteur',
            'interieur',
            'carnet'
        ];

        this.init();
    }

    init() {
        this.setupNavigation();
        this.setupForms();
        this.setupChecklist();
        this.setupPhotoUpload();
        this.setupEdlPhase();           // <<< phase EDL
        this.setupSignature();

        this.checkApiConnection();
        this.loadStats();
        this.loadAllMissions();
        this.setupPWA();

        this.initializeEnhancedFeatures();
    }

    // ---------------- NAV ----------------
    setupNavigation() {
        const navPills = document.querySelectorAll('.nav-pill');
        const sections = document.querySelectorAll('.section');

        navPills.forEach(pill => {
            pill.addEventListener('click', () => {
                const targetSection = pill.dataset.section;
                navPills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');

                sections.forEach(s => s.classList.remove('active'));
                document.getElementById(targetSection).classList.add('active');
                this.currentSection = targetSection;
            });
        });
    }

    // ---------------- FORMS ----------------
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
        inputs.forEach(input => {
            input.addEventListener('blur', () => {
                this.validateField(input);
            });
        });
    }

    validateField(field) {
        const value = field.value.trim();
        const isRequired = field.hasAttribute('required');
        if (isRequired && !value) {
            field.style.borderColor = 'var(--danger-red)';
            return false;
        } else {
            field.style.borderColor = 'var(--border-color)';
            return true;
        }
    }

    setupAccessForm() {
        const form = document.getElementById('accessForm');
        if (!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const code = document.getElementById('missionCode').value.trim();
            await this.accessMission(code);
        });
    }

    setupTrackingForm() {
        const form = document.getElementById('trackingForm');
        if (!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const code = document.getElementById('trackingCode').value.trim();
            await this.trackMission(code);
        });
    }

    // ---------------- CHECKLIST ----------------
    setupChecklist() {
        const radioGroups = document.querySelectorAll('input[type="radio"]');
        radioGroups.forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.checklistData[e.target.name] = e.target.value;
                this.updateProgress();
            });
        });
    }

    isChecklistComplete() {
        const requiredChecks = ['vehiclePapers', 'gps', 'sdCard', 'safetyKit', 'spareWheel'];
        return requiredChecks.every(check => this.checklistData[check]) && this.keyCount > 0;
    }

    // ---------------- EDL PHASE ----------------
    setupEdlPhase() {
        const radios = document.querySelectorAll('input[name="edlPhase"]');
        const signatureBlock = document.getElementById('signatureBlock');
        const badge = document.getElementById('phaseBadge');

        const applyPhaseUI = () => {
            // Signature uniquement visible en Arrivée
            if (signatureBlock) {
                signatureBlock.style.display = this.edlPhase === 'arrivee' ? '' : 'none';
            }
            if (badge) {
                badge.textContent = this.edlPhase === 'arrivee' ? '(Arrivée)' : '(Départ)';
            }
            // Rafraîchir les previews selon la phase
            this.refreshPhotoPreviewsForPhase(this.edlPhase);
        };

        radios.forEach(r => {
            r.addEventListener('change', () => {
                this.edlPhase = r.value; // 'depart' | 'arrivee'
                applyPhaseUI();
            });
        });

        // Init
        this.edlPhase = [...radios].find(r => r.checked)?.value || 'depart';
        applyPhaseUI();
    }

    // ---------------- PHOTOS ----------------
    setupPhotoUpload() {
        const photoInputs = document.querySelectorAll('input[type="file"][data-photo]');
        photoInputs.forEach(input => {
            input.addEventListener('change', (e) => this.handlePhotoUpload(e));
        });
    }

    async handlePhotoUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const phase = this.edlPhase; // utilise la phase active
        const photoType = event.target.dataset.photo;
        const photoCard = event.target.closest('.photo-card');
        const preview = photoCard.querySelector('.photo-preview');
        const status = photoCard.querySelector('.upload-status');
        const btn = photoCard.querySelector('.photo-btn');

        try {
            // Preview DataURL (pour rafraîchir quand on rechange de phase)
            const reader = new FileReader();
            reader.onload = (e) => {
                const dataUrl = e.target.result;
                preview.src = dataUrl;
                preview.style.display = 'block';
                btn.innerHTML = '<i class="fas fa-check"></i> Photo prise';
                btn.style.background = 'var(--success-green)';

                // Mémo pour re-afficher quand on revient sur cette phase
                this.previewsDataURL[phase][photoType] = dataUrl;
            };
            reader.readAsDataURL(file);

            // Compression
            const compressedFile = await this.compressImage(file);

            // Upload vers API si mission active
            if (this.currentMission) {
                await this.uploadPhoto(this.currentMission.id, photoType, compressedFile, phase);
                photoCard.classList.add('uploaded');
                if (status) status.innerHTML = '<i class="fas fa-check" style="color: var(--success-green);"></i>';
                this.uploadedPhotos[phase][photoType] = true;
                this.updateProgress();
            } else {
                // En attente (offline)
                this.uploadedPhotos[phase][photoType] = compressedFile;
            }

        } catch (error) {
            console.error('Erreur upload photo:', error);
            if (status) status.innerHTML = '<i class="fas fa-times" style="color: var(--danger-red);"></i>';
            this.showNotification('Erreur lors de l\'upload de la photo', 'error');
        }
    }

    refreshPhotoPreviewsForPhase(phase) {
        // Pour chaque carte, si on a un DataURL mémorisé pour cette phase, on l’affiche
        document.querySelectorAll('.photo-card').forEach(card => {
            const type = card.getAttribute('data-type') || card.querySelector('[data-photo]')?.dataset.photo;
            const preview = card.querySelector('.photo-preview');
            const btn = card.querySelector('.photo-btn');
            const hasImg = type && this.previewsDataURL[phase][type];

            if (preview && btn) {
                if (hasImg) {
                    preview.src = this.previewsDataURL[phase][type];
                    preview.style.display = 'block';
                    btn.innerHTML = '<i class="fas fa-check"></i> Photo prise';
                    btn.style.background = 'var(--success-green)';
                    card.classList.add('uploaded');
                } else {
                    preview.style.display = 'none';
                    btn.innerHTML = btn.innerHTML.includes('Photo prise') ? '<i class="fas fa-camera"></i> Prendre photo' : btn.innerHTML;
                    btn.style.background = '';
                    card.classList.remove('uploaded');
                }
            }
        });
    }

    async handleOptionalPhotoUpload(event, photoId) {
        const file = event.target.files[0];
        if (!file) return;

        const photo = this.optionalPhotos.find(p => p.id === photoId);
        if (!photo) return;

        const photoCard = event.target.closest('.photo-card');
        const preview = photoCard.querySelector('.photo-preview');
        const btn = photoCard.querySelector('.photo-btn');

        try {
            const compressedFile = await this.compressImage(file);
            photo.file = compressedFile;

            const reader = new FileReader();
            reader.onload = (e) => {
                preview.src = e.target.result;
                preview.style.display = 'block';
                btn.innerHTML = '<i class="fas fa-check"></i> Photo prise';
                btn.style.background = 'var(--success-green)';
            };
            reader.readAsDataURL(compressedFile);

            if (this.currentMission) {
                await this.uploadPhoto(this.currentMission.id, `optional-${photoId}`, compressedFile, this.edlPhase);
                photo.uploaded = true;
            }
        } catch (error) {
            console.error('Erreur upload photo optionnelle:', error);
            this.showNotification('Erreur lors de l\'upload de la photo', 'error');
        }
    }

    async compressImage(file, maxWidth = 800, quality = 0.8) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();

            img.onload = () => {
                const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
                canvas.width = Math.max(1, Math.round(img.width * ratio));
                canvas.height = Math.max(1, Math.round(img.height * ratio));
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(resolve, 'image/jpeg', quality);
            };

            img.src = URL.createObjectURL(file);
        });
    }

    // ---------------- SIGNATURE (arrivée uniquement) ----------------
    setupSignature() {
        const canvas = document.getElementById('signatureCanvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        canvas.width = 500;
        canvas.height = 200;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';

        const start = (e) => {
            // Bloqué si pas en Arrivée
            if (this.edlPhase !== 'arrivee') {
                this.showNotification("La signature n'est possible qu'à l'arrivée.", 'warning');
                return;
            }
            this.isDrawing = true;
            const rect = canvas.getBoundingClientRect();
            ctx.beginPath();
            ctx.moveTo((e.clientX || e.touches[0].clientX) - rect.left, (e.clientY || e.touches[0].clientY) - rect.top);
        };
        const move = (e) => {
            if (!this.isDrawing) return;
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
            const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
            ctx.lineTo(x, y);
            ctx.stroke();
        };
        const end = () => {
            if (!this.isDrawing) return;
            this.isDrawing = false;
            this.signatureData = canvas.toDataURL();
            this.updateProgress();
        };

        // Souris
        canvas.addEventListener('mousedown', start);
        canvas.addEventListener('mousemove', move);
        window.addEventListener('mouseup', end);
        // Tactile
        canvas.addEventListener('touchstart', (e)=>{ e.preventDefault(); start(e); }, {passive:false});
        canvas.addEventListener('touchmove', (e)=>{ e.preventDefault(); move(e); }, {passive:false});
        canvas.addEventListener('touchend', (e)=>{ e.preventDefault(); end(e); }, {passive:false});

        // Boutons
        const clearBtn = document.getElementById('clearSignature');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                this.signatureData = null;
            });
        }

        const finalizeBtn = document.getElementById('finalizeInspection');
        if (finalizeBtn) {
            finalizeBtn.addEventListener('click', () => this.finalizeInspection());
        }
    }

    // ---------------- API GENERIC ----------------
    async apiCall(endpoint, options = {}) {
        const url = `${API_BASE_URL}${endpoint}`;
        const fetchOptions = {
            headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) },
            ...options
        };
        try {
            const response = await fetch(url, fetchOptions);
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            // si on attend un blob (ex. PDF), l'appel direct utilisera fetch hors apiCall
            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
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

    // ---------------- DASHBOARD ----------------
    async loadStats() {
        try {
            const response = await this.apiCall('/stats');
            const stats = response.data || response;
            const totalEl = document.getElementById('totalMissions');
            const pendingEl = document.getElementById('pendingMissions');
            const completedEl = document.getElementById('completedMissions');
            const progressEl = document.getElementById('progressMissions');
            if (totalEl) totalEl.textContent = stats.total || 0;
            if (pendingEl) pendingEl.textContent = stats.pending || 0;
            if (completedEl) completedEl.textContent = stats.completed || 0;
            if (progressEl) progressEl.textContent = stats.in_progress || 0;
        } catch (e) {
            console.error('Erreur chargement stats:', e);
        }
    }

    async loadAllMissions() {
        try {
            const response = await this.apiCall('/missions');
            const missions = response.data || [];
            this.displayMissionsList(missions);
        } catch (e) {
            console.error('Erreur chargement missions:', e);
        }
    }

    displayMissionsList(missions) {
        const listEl = document.getElementById('missionsList');
        if (!listEl) return;

        if (!missions.length) {
            listEl.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Aucune mission créée pour le moment.</p>';
            return;
        }

        listEl.innerHTML = missions.map(mission => `
            <div class="mission-item">
                <div class="mission-header">
                    <h4>${mission.vehicle_brand} ${mission.vehicle_model} - ${mission.mission_code}</h4>
                    <span class="status-badge status-${mission.status}">${this.getStatusText(mission.status)}</span>
                </div>
                <div class="mission-details">
                    <p><strong>Client:</strong> ${mission.client_name}</p>
                    <p><strong>Email:</strong> ${mission.client_email}</p>
                    <p><strong>Téléphone:</strong> ${mission.client_phone || 'N/A'}</p>
                    <p><strong>Date création:</strong> ${new Date(mission.created_at).toLocaleDateString('fr-FR')}</p>
                    <p><strong>Lieu prise en charge:</strong> ${mission.pickup_location}</p>
                    <p><strong>Lieu livraison:</strong> ${mission.delivery_location}</p>
                </div>
                <div class="mission-actions">
                    <button onclick="app.switchToPrestataire('${mission.mission_code}')" class="btn-secondary">
                        👨‍🔧 Interface Prestataire
                    </button>
                    <button onclick="app.switchToClient('${mission.mission_code}')" class="btn-secondary">
                        👤 Suivi Client  
                    </button>
                    ${mission.status === 'completed' ? `
                        <button onclick="app.downloadReport(${mission.id})" class="btn-success">
                            📄 Télécharger Rapport
                        </button>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }

    // ---------------- MISSIONS ----------------
    async createMission() {
        this.showLoading(true);
        try {
            const formData = new FormData(document.getElementById('missionForm'));
            const missionData = {
                vehicleBrand: formData.get('vehicleBrand'),
                vehicleModel: formData.get('vehicleModel'),
                vehicleYear: formData.get('vehicleYear'),
                licensePlate: formData.get('licensePlate'),
                mileage: formData.get('mileage'),
                fuelLevel: formData.get('fuelLevel'),
                interiorCondition: formData.get('interiorCondition'),
                exteriorCondition: formData.get('exteriorCondition'),
                pickupLocation: formData.get('pickupLocation'),
                deliveryLocation: formData.get('deliveryLocation'),
                pickupDate: formData.get('pickupDate'),
                deliveryDate: formData.get('deliveryDate'),
                urgency: formData.get('urgency') || 'normal',
                missionType: formData.get('missionType') || 'inspection',
                clientName: formData.get('clientName'),
                clientEmail: formData.get('clientEmail'),
                clientPhone: formData.get('clientPhone'),
                clientCompany: formData.get('clientCompany')
            };
            await this.apiCall('/missions', { method: 'POST', body: JSON.stringify(missionData) });
            this.showNotification('Mission créée avec succès! 🎉', 'success');
            document.getElementById('missionForm').reset();
            this.loadStats();
            this.loadAllMissions();
        } catch (e) {
            console.error('Erreur création mission:', e);
            this.showNotification('Erreur lors de la création de la mission', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async accessMission(code) {
        this.showLoading(true);
        try {
            const response = await this.apiCall(`/missions/${code}`);
            this.currentMission = response.data;
            this.displayMissionDetails(response.data);
            this.showNotification('Mission chargée avec succès! ✅', 'success');
            // passer à l’étape Accès/EDL Départ visuellement
            this.updateProgress(true);
        } catch {
            this.showNotification('Mission introuvable ❌', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async trackMission(code) {
        this.showLoading(true);
        try {
            const response = await this.apiCall(`/missions/${code}`);
            this.displayTrackingInfo(response.data);
            this.showNotification('Mission trouvée! ✅', 'success');
        } catch {
            this.showNotification('Mission introuvable ❌', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    displayMissionDetails(mission) {
        const detailsEl = document.getElementById('missionDetails');
        const infoEl = document.getElementById('missionInfo');
        if (!detailsEl || !infoEl) return;

        infoEl.innerHTML = `
            <div style="background: var(--light-gray); padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
                    <div><strong>🚗 Véhicule:</strong><br>${mission.vehicle_brand} ${mission.vehicle_model} ${mission.vehicle_year ? '(' + mission.vehicle_year + ')' : ''}</div>
                    <div><strong>🔢 Plaque:</strong><br>${mission.license_plate || 'N/A'}</div>
                    <div><strong>👤 Client:</strong><br>${mission.client_name}${mission.client_company ? '<br><small>' + mission.client_company + '</small>' : ''}</div>
                    <div><strong>📋 Code mission:</strong><br><span style="font-family:monospace;background:#fff;padding:4px 8px;border-radius:4px;">${mission.mission_code}</span></div>
                </div>
            </div>
        `;
        detailsEl.style.display = 'block';
        // rafraîchir les previews pour la phase active
        this.refreshPhotoPreviewsForPhase(this.edlPhase);
    }

    displayTrackingInfo(mission) {
        const resultEl = document.getElementById('trackingResult');
        const infoEl = document.getElementById('trackingInfo');
        if (!resultEl || !infoEl) return;

        infoEl.innerHTML = `
            <div style="background: var(--light-gray); padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
                    <div><strong>🚗 Véhicule:</strong><br>${mission.vehicle_brand} ${mission.vehicle_model}</div>
                    <div><strong>📊 Statut:</strong><br><span class="status-badge status-${mission.status}">${this.getStatusText(mission.status)}</span></div>
                    <div><strong>📅 Date création:</strong><br>${new Date(mission.created_at).toLocaleDateString('fr-FR')}</div>
                    <div><strong>📋 Code mission:</strong><br><span style="font-family:monospace;">${mission.mission_code}</span></div>
                </div>
            </div>
        `;
        resultEl.style.display = 'block';
        this.updateClientProgress(mission.status);

        if (mission.status === 'completed') {
            const downloadEl = document.getElementById('downloadSection');
            if (downloadEl) {
                downloadEl.style.display = 'block';
                const downloadBtn = document.getElementById('downloadReport');
                if (downloadBtn) downloadBtn.onclick = () => this.downloadReport(mission.id);
            }
        }
    }

    // ---------------- PROGRESS (Prestataire) ----------------
    updateProgress(onAccess = false) {
        // Étapes (visuelles) : 1 Accès → 2 Checklist → 3 Photos Départ → 4 Photos Départ OK → 5 Signature & Fin
        // NB: on exige toutes les photos Départ ET Arrivée + signature à l'arrivée pour finaliser (validation plus bas)
        const departCount = this.requiredPhotos.filter(t => this.uploadedPhotos.depart[t]).length;

        let currentStep = 1;
        if (onAccess || this.currentMission) currentStep = 1;
        if (this.isChecklistComplete()) currentStep = 2;
        if (departCount > 0) currentStep = 3;
        if (departCount === this.requiredPhotos.length) currentStep = 4;
        if (this.signatureData) currentStep = 5;

        const steps = document.querySelectorAll('#missionDetails .progress-step');
        steps.forEach((step, idx) => {
            step.classList.remove('active', 'completed');
            if (idx + 1 < currentStep) {
                step.classList.add('completed');
                step.textContent = '✓';
            } else if (idx + 1 === currentStep) {
                step.classList.add('active');
                step.textContent = (idx + 1);
            } else {
                step.textContent = (idx + 1);
            }
        });

        const progressLine = document.getElementById('progressLine');
        if (progressLine) {
            progressLine.style.width = `${((currentStep - 1) / 4) * 100}%`;
        }
    }

    updateClientProgress(status) {
        const statusMap = { 'pending': 1, 'assigned': 2, 'in_progress': 3, 'photos_taken': 4, 'completed': 5 };
        const currentStep = statusMap[status] || 1;

        const steps = document.querySelectorAll('#trackingResult .progress-step');
        steps.forEach((step, index) => {
            step.classList.remove('active', 'completed');
            if (index + 1 < currentStep) {
                step.classList.add('completed'); step.textContent = '✓';
            } else if (index + 1 === currentStep) {
                step.classList.add('active');
            } else {
                step.textContent = index + 1;
            }
        });

        const progressLine = document.getElementById('clientProgressLine');
        if (progressLine) progressLine.style.width = `${((currentStep - 1) / 4) * 100}%`;
    }

    // ---------------- FINALISATION ----------------
    async finalizeInspection() {
        if (!this.currentMission) return;

        // Exigences : checklist OK + toutes photos départ ET arrivée + signature (phase arrivée)
        const missingDepart = this.requiredPhotos.filter(t => !this.uploadedPhotos.depart[t]);
        const missingArrivee = this.requiredPhotos.filter(t => !this.uploadedPhotos.arrivee[t]);

        if (!this.isChecklistComplete()) {
            this.showNotification('Checklist incomplète', 'warning');
            return;
        }
        if (missingDepart.length) {
            this.showNotification(`Photos Départ manquantes: ${missingDepart.join(', ')}`, 'warning');
            return;
        }
        if (missingArrivee.length) {
            this.showNotification(`Photos Arrivée manquantes: ${missingArrivee.join(', ')}`, 'warning');
            return;
        }
        if (this.edlPhase !== 'arrivee') {
            this.showNotification("La signature et la finalisation ne sont possibles qu’à l'arrivée.", 'warning');
            return;
        }
        if (!this.signatureData) {
            this.showNotification('Signature client requise', 'warning');
            return;
        }

        this.showLoading(true);
        try {
            // Sauvegarde inspection (obs + signature + checklist + clés)
            await this.saveInspectionData();

            // Statut final
            await this.apiCall(`/missions/${this.currentMission.id}/status`, {
                method: 'PUT',
                body: JSON.stringify({ status: 'completed' })
            });

            this.showNotification('Inspection finalisée avec succès! 🎉', 'success');
            this.updateProgress();

            // Écran de fin + retour accueil Prestataire
            const finishScreen = document.getElementById('finishScreen');
            const missionDetails = document.getElementById('missionDetails');
            const goPrestataireHomeBtn = document.getElementById('goPrestataireHome');
            if (finishScreen) finishScreen.style.display = '';
            const goHome = () => {
                if (missionDetails) missionDetails.style.display = 'none';
                const prestTab = document.querySelector('[data-section="prestataire"]');
                const sections = document.querySelectorAll('.section');
                const pills = document.querySelectorAll('.nav-pill');
                pills.forEach(b => b.classList.remove('active'));
                prestTab && prestTab.classList.add('active');
                sections.forEach(s => s.classList.remove('active'));
                document.getElementById('prestataire')?.classList.add('active');
                window.scrollTo({ top: 0, behavior: 'smooth' });
                if (finishScreen) finishScreen.style.display = 'none';
            };
            setTimeout(goHome, 6000);
            if (goPrestataireHomeBtn) goPrestataireHomeBtn.onclick = goHome;

        } catch (error) {
            this.showNotification('Erreur lors de la finalisation', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async saveInspectionData() {
        if (!this.currentMission) return;
        const observations = document.getElementById('observations')?.value || '';
        const inspectionData = {
            observations,
            signature: this.signatureData,
            checklist: this.checklistData,
            keyCount: this.keyCount,
            photos: {
                depart: Object.keys(this.uploadedPhotos.depart).filter(k => !!this.uploadedPhotos.depart[k]),
                arrivee: Object.keys(this.uploadedPhotos.arrivee).filter(k => !!this.uploadedPhotos.arrivee[k])
            }
        };
        await this.apiCall(`/missions/${this.currentMission.id}/inspection`, {
            method: 'POST',
            body: JSON.stringify(inspectionData)
        });
    }

    // ---------------- UTILS / API SPÉ ----------------
    getStatusText(status) {
        const statusTexts = {
            'pending': 'En attente',
            'assigned': 'Assignée',
            'in_progress': 'En cours',
            'photos_taken': 'Photos prises',
            'completed': 'Terminée',
            'cancelled': 'Annulée'
        };
        return statusTexts[status] || status;
    }

    switchToPrestataire(code) {
        const prestataireTab = document.querySelector('[data-section="prestataire"]');
        if (prestataireTab) {
            prestataireTab.click();
            setTimeout(() => {
                const codeInput = document.getElementById('missionCode');
                const form = document.getElementById('accessForm');
                if (codeInput && form) {
                    codeInput.value = code;
                    form.dispatchEvent(new Event('submit'));
                }
            }, 100);
        }
    }

    switchToClient(code) {
        const clientTab = document.querySelector('[data-section="client"]');
        if (clientTab) {
            clientTab.click();
            setTimeout(() => {
                const codeInput = document.getElementById('trackingCode');
                const form = document.getElementById('trackingForm');
                if (codeInput && form) {
                    codeInput.value = code;
                    form.dispatchEvent(new Event('submit'));
                }
            }, 100);
        }
    }

    async downloadReport(missionId) {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/${missionId}/pdf`);
            if (!response.ok) throw new Error('Erreur téléchargement');
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `rapport-mission-${missionId}.pdf`; a.click();
            URL.revokeObjectURL(url);
            this.showNotification('Rapport téléchargé! 📄', 'success');
        } catch {
            this.showNotification('Erreur téléchargement rapport', 'error');
        }
    }

    async uploadPhoto(missionId, photoType, file, phase) {
        const formData = new FormData();
        formData.append('photo', file);
        formData.append('photoType', photoType);
        formData.append('phase', phase); // <<< IMPORTANT pour le backend

        const response = await fetch(`${API_BASE_URL}/uploads/photos/${missionId}`, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) throw new Error('Erreur upload photo');
        return response.json();
    }

    // ---------------- PWA ----------------
    setupPWA() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(()=>{});
        }
        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault(); deferredPrompt = e; this.showInstallPrompt(deferredPrompt);
        });
    }

    showInstallPrompt(deferredPrompt) {
        const installBtn = document.createElement('button');
        installBtn.className = 'btn-enhanced btn-primary';
        installBtn.innerHTML = '<i class="fas fa-download"></i> Installer l\'app';
        installBtn.onclick = async () => {
            if (!deferredPrompt) return this.showNotification('Installation indisponible', 'info');
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            deferredPrompt = null;
            installBtn.remove();
        };
        installBtn.style.position = 'fixed';
        installBtn.style.bottom = '20px';
        installBtn.style.right = '20px';
        installBtn.style.zIndex = '1000';
        document.body.appendChild(installBtn);
        setTimeout(()=> installBtn.remove(), 10000);
    }

    // ---------------- GÉOLOC ----------------
    async getCurrentLocation(inputId) {
        if (!navigator.geolocation) {
            this.showNotification('Géolocalisation non supportée', 'error');
            return;
        }
        this.showLoading(true);
        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 60000
                });
            });
            const { latitude, longitude } = position.coords;
            const address = await this.reverseGeocode(latitude, longitude);
            const inputEl = document.getElementById(inputId);
            if (inputEl) inputEl.value = address;
            this.showNotification('Position détectée! 📍', 'success');
        } catch (error) {
            this.showNotification('Erreur géolocalisation: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async reverseGeocode(lat, lng) {
        // Nominatim OSM (peut être limité/CORS en prod — à remplacer par ton backend proxy si besoin)
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
            const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
            const data = await res.json();
            return data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        } catch {
            return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        }
    }

    // ---------------- QR ----------------
    openQrScanner() {
        const el = document.getElementById('qrScanner');
        if (el) el.style.display = 'flex';
        this.showNotification('Scanner QR activé (simulation)', 'info');
        setTimeout(() => {
            const simulatedCode = 'FA-20250823-001';
            if (this.currentSection === 'prestataire') {
                const codeInput = document.getElementById('missionCode');
                if (codeInput) codeInput.value = simulatedCode;
            } else if (this.currentSection === 'client') {
                const codeInput = document.getElementById('trackingCode');
                if (codeInput) codeInput.value = simulatedCode;
            }
            this.closeQrScanner();
            this.showNotification(`QR Code lu: ${simulatedCode}`, 'success');
        }, 3000);
    }
    closeQrScanner() {
        const el = document.getElementById('qrScanner');
        if (el) el.style.display = 'none';
    }

    // ---------------- THEME ----------------
    toggleTheme() {
        const currentTheme = document.body.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.body.setAttribute('data-theme', newTheme);
        const icon = document.getElementById('theme-icon');
        if (icon) icon.className = newTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
        localStorage.setItem('theme', newTheme);
        this.showNotification(`Mode ${newTheme === 'dark' ? 'sombre' : 'clair'} activé`, 'info');
    }

    // ---------------- UI UTILS ----------------
    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = show ? 'flex' : 'none';
    }

    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        if (!notification) return alert(message);
        notification.textContent = message;
        notification.className = `notification ${type} show`;
        setTimeout(() => notification.classList.remove('show'), 4000);
    }

    // ---------------- Autosave ----------------
    setupAutoSave() {
        const obs = document.getElementById('observations');
        if (!obs) return;
        let to;
        obs.addEventListener('input', () => {
            clearTimeout(to);
            to = setTimeout(() => { if (this.currentMission) this.autoSaveObservations(); }, 2000);
        });
    }

    async autoSaveObservations() {
        try {
            const observations = document.getElementById('observations')?.value || '';
            await this.apiCall(`/missions/${this.currentMission.id}/observations`, {
                method: 'PUT',
                body: JSON.stringify({ observations })
            });
            // mini indicateur
            const indicator = document.createElement('span');
            indicator.innerHTML = '✅ Sauvegardé';
            indicator.style.color = 'var(--success-green)';
            indicator.style.fontSize = '12px';
            indicator.style.position = 'absolute';
            indicator.style.right = '10px';
            indicator.style.top = '10px';
            const container = document.getElementById('observations').parentElement;
            container.style.position = 'relative';
            container.appendChild(indicator);
            setTimeout(()=> indicator.remove(), 2000);
        } catch (e) {
            console.error('Erreur auto-save:', e);
        }
    }

    // ---------------- INIT+ ----------------
    initializeEnhancedFeatures() {
        this.setupAutoSave();
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            document.body.setAttribute('data-theme', savedTheme);
            const icon = document.getElementById('theme-icon');
            if (icon) icon.className = savedTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
        }
    }
}

// Fonctions globales (pour HTML onclick)
window.toggleTheme = () => window.app?.toggleTheme();
window.getCurrentLocation = (inputId) => window.app?.getCurrentLocation(inputId);
window.openQrScanner = () => window.app?.openQrScanner();
window.closeQrScanner = () => window.app?.closeQrScanner();
window.sendReportByEmail = () => {
    const email = prompt('Entrez votre adresse email:');
    if (email && window.app) window.app.showNotification('Rapport envoyé à ' + email, 'success');
};

// Gestion des clés
window.adjustKeys = (change) => {
    if (!window.app) return;
    window.app.keyCount = Math.max(0, window.app.keyCount + change);
    const countEl = document.getElementById('keyCount');
    if (countEl) countEl.textContent = window.app.keyCount;
    window.app.checklistData.keyCount = window.app.keyCount;
    window.app.updateProgress();
};

// Photos optionnelles
window.addOptionalPhoto = () => {
    if (!window.app) return;
    window.app.optionalPhotos.push({ id: Date.now(), file: null, uploaded: false });
    window.app.renderOptionalPhotos();
};

window.removeOptionalPhoto = (button) => {
    if (!window.app) return;
    const card = button.parentElement;
    const photoId = parseInt(card.dataset.photoId);
    window.app.optionalPhotos = window.app.optionalPhotos.filter(p => p.id !== photoId);
    card.remove();
    window.app.updateOptionalPhotoCount();
};

// Initialisation
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new FiableAutoApp();
    window.app = app;
    setTimeout(() => app.showNotification('🚗 FiableAuto Enhanced chargé!', 'success'), 800);
});

// Erreurs globales
window.addEventListener('error', (e) => {
    console.error('Erreur application:', e.error);
    if (app) app.showNotification('Une erreur est survenue', 'error');
});

// Réseau
window.addEventListener('online', () => { app?.checkApiConnection(); app?.showNotification('Connexion rétablie ✅', 'success'); });
window.addEventListener('offline', () => app?.showNotification('Mode hors ligne 📵', 'warning'));

// Service Worker messages
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'SYNC_COMPLETE' && app) {
            app.showNotification('Données synchronisées ✅', 'success');
        }
    });
}
