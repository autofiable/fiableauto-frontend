// Configuration API
const API_BASE_URL = 'https://fiableauto-production-production.up.railway.app/api';

// État global de l'application
class FiableAutoApp {
    constructor() {
        this.currentSection = 'gestionnaire';
        this.currentMission = null;
        this.uploadedPhotos = {};
        this.signatureData = null;
        this.isDrawing = false;
        this.init();
    }

    init() {
        this.setupNavigation();
        this.setupForms();
        this.setupPhotoUpload();
        this.setupSignature();
        this.checkApiConnection();
        this.loadStats();
    }

    // Navigation entre sections
    setupNavigation() {
        const navPills = document.querySelectorAll('.nav-pill');
        const sections = document.querySelectorAll('.section');

        navPills.forEach(pill => {
            pill.addEventListener('click', () => {
                const targetSection = pill.dataset.section;
                
                // Mise à jour des pills
                navPills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                
                // Mise à jour des sections
                sections.forEach(s => s.classList.remove('active'));
                document.getElementById(targetSection).classList.add('active');
                
                this.currentSection = targetSection;
            });
        });
    }

    // Configuration des formulaires
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

    // Gestion des photos
    setupPhotoUpload() {
        const photoInputs = document.querySelectorAll('input[type="file"][data-photo]');
        photoInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                this.handlePhotoUpload(e);
            });
        });
    }

    async handlePhotoUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const photoType = event.target.dataset.photo;
        const photoItem = event.target.closest('.photo-item');
        const preview = photoItem.querySelector('.photo-preview');
        const status = photoItem.querySelector('.upload-status');

        try {
            // Compression de l'image
            const compressedFile = await this.compressImage(file);
            
            // Affichage de la preview
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.src = e.target.result;
                preview.style.display = 'block';
            };
            reader.readAsDataURL(compressedFile);

            // Upload vers l'API
            if (this.currentMission) {
                await this.uploadPhoto(this.currentMission.id, photoType, compressedFile);
                photoItem.classList.add('uploaded');
                status.innerHTML = '<i class="fas fa-check" style="color: var(--success-green);"></i>';
                this.uploadedPhotos[photoType] = true;
                this.updateProgress();
            }

        } catch (error) {
            console.error('Erreur upload photo:', error);
            status.innerHTML = '<i class="fas fa-times" style="color: var(--danger-red);"></i>';
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
                canvas.width = img.width * ratio;
                canvas.height = img.height * ratio;
                
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(resolve, 'image/jpeg', quality);
            };
            
            img.src = URL.createObjectURL(file);
        });
    }

    // Gestion de la signature
    setupSignature() {
        const canvas = document.getElementById('signatureCanvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        
        // Configuration du canvas
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';

        // Événements souris
        canvas.addEventListener('mousedown', (e) => this.startDrawing(e, ctx));
        canvas.addEventListener('mousemove', (e) => this.draw(e, ctx));
        canvas.addEventListener('mouseup', () => this.stopDrawing());

        // Événements tactiles
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            canvas.dispatchEvent(mouseEvent);
        });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            canvas.dispatchEvent(mouseEvent);
        });

        canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            const mouseEvent = new MouseEvent('mouseup', {});
            canvas.dispatchEvent(mouseEvent);
        });

        // Bouton effacer
        const clearBtn = document.getElementById('clearSignature');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                this.signatureData = null;
            });
        }

        // Bouton finaliser
        const finalizeBtn = document.getElementById('finalizeInspection');
        if (finalizeBtn) {
            finalizeBtn.addEventListener('click', () => this.finalizeInspection());
        }
    }

    startDrawing(e, ctx) {
        this.isDrawing = true;
        const rect = e.target.getBoundingClientRect();
        ctx.beginPath();
        ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    }

    draw(e, ctx) {
        if (!this.isDrawing) return;
        const rect = e.target.getBoundingClientRect();
        ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
        ctx.stroke();
    }

    stopDrawing() {
        this.isDrawing = false;
        const canvas = document.getElementById('signatureCanvas');
        this.signatureData = canvas.toDataURL();
    }

    // API calls
    async apiCall(endpoint, options = {}) {
        const url = `${API_BASE_URL}${endpoint}`;
        
        try {
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    async checkApiConnection() {
        const statusEl = document.getElementById('connectionStatus');
        
        try {
            await this.apiCall('/health');
            statusEl.textContent = '🟢 Connecté';
            statusEl.className = 'connection-status online';
        } catch (error) {
            statusEl.textContent = '🔴 Hors ligne';
            statusEl.className = 'connection-status offline';
        }
    }

    async loadStats() {
        try {
            const stats = await this.apiCall('/stats');
            document.getElementById('totalMissions').textContent = stats.data?.total || 0;
            document.getElementById('pendingMissions').textContent = stats.data?.pending || 0;
            document.getElementById('completedMissions').textContent = stats.data?.completed || 0;
            document.getElementById('progressMissions').textContent = stats.data?.in_progress || 0;
        } catch (error) {
            console.error('Erreur chargement stats:', error);
        }
    }

    async createMission() {
        this.showLoading(true);
        
        try {
            const formData = new FormData(document.getElementById('missionForm'));
            
            // ✅ CORRECTION: Mapping correct des champs du formulaire
            const missionData = {
                vehicleBrand: formData.get('vehicleBrand') || formData.get('marqueVehicule'),
                vehicleModel: formData.get('vehicleModel') || formData.get('modeleVehicule'),
                vehicleYear: formData.get('vehicleYear') || formData.get('anneeVehicule'),
                licensePlate: formData.get('licensePlate') || formData.get('plaqueImmatriculation'),
                vin: formData.get('vin'),
                mileage: formData.get('mileage') || formData.get('kilometrage'),
                pickupLocation: formData.get('pickupLocation') || formData.get('lieuPriseEnCharge'),
                deliveryLocation: formData.get('deliveryLocation') || formData.get('lieuLivraison'),
                pickupDate: formData.get('pickupDate') || formData.get('datePriseEnCharge'),
                deliveryDate: formData.get('deliveryDate') || formData.get('dateLivraisonPrevue'),
                urgency: formData.get('urgency') || formData.get('niveauUrgence') || 'normal',
                clientName: formData.get('clientName') || formData.get('nomClient'),
                clientEmail: formData.get('clientEmail') || formData.get('emailClient'),
                clientPhone: formData.get('clientPhone') || formData.get('telephoneClient'),
                clientCompany: formData.get('clientCompany') || formData.get('entrepriseClient'),
                providerName: formData.get('providerName') || formData.get('nomPrestataire'),
                providerEmail: formData.get('providerEmail') || formData.get('emailPrestataire'),
                providerPhone: formData.get('providerPhone') || formData.get('telephonePrestataire'),
                observations: formData.get('observations'),
                internalNotes: formData.get('internalNotes') || formData.get('notesInternes')
            };

            console.log('Données mission:', missionData); // Pour debug
            
            const response = await this.apiCall('/missions', {
                method: 'POST',
                body: JSON.stringify(missionData)
            });

            this.showNotification('Mission créée avec succès!', 'success');
            document.getElementById('missionForm').reset();
            this.loadStats();
            this.displayMissionLink(response.data); // ✅ CORRECTION: response.data au lieu de response.mission
            
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
            this.currentMission = response.data;
            
            this.displayMissionDetails(response.data);
            this.showNotification('Mission chargée avec succès!', 'success');
            
        } catch (error) {
            this.showNotification('Mission introuvable', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async trackMission(code) {
        this.showLoading(true);
        
        try {
            const response = await this.apiCall(`/missions/${code}`);
            this.displayTrackingInfo(response.data);
            this.showNotification('Mission trouvée!', 'success');
            
        } catch (error) {
            this.showNotification('Mission introuvable', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async uploadPhoto(missionId, photoType, file) {
        const formData = new FormData();
        formData.append('photo', file);
        formData.append('photoType', photoType);

        const response = await fetch(`${API_BASE_URL}/uploads/photos/${missionId}`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Erreur upload photo');
        }

        return response.json();
    }

    async saveObservations() {
        if (!this.currentMission) return;

        const observations = document.getElementById('observations').value;
        
        try {
            await this.apiCall(`/missions/${this.currentMission.id}/observations`, {
                method: 'PUT',
                body: JSON.stringify({ observations })
            });
        } catch (error) {
            console.error('Erreur sauvegarde observations:', error);
        }
    }

    async saveSignature() {
        if (!this.currentMission || !this.signatureData) return;

        try {
            await this.apiCall(`/missions/${this.currentMission.id}/signature`, {
                method: 'POST',
                body: JSON.stringify({ signature: this.signatureData })
            });
        } catch (error) {
            console.error('Erreur sauvegarde signature:', error);
            throw error;
        }
    }

    async finalizeInspection() {
        if (!this.currentMission) return;

        // Vérifications
        const requiredPhotos = ['compteur', 'face-avant', 'face-arriere', 'cote-gauche', 'cote-droit', 'moteur', 'carnet', 'interieur'];
        const missingPhotos = requiredPhotos.filter(type => !this.uploadedPhotos[type]);
        
        if (missingPhotos.length > 0) {
            this.showNotification(`Photos manquantes: ${missingPhotos.join(', ')}`, 'warning');
            return;
        }

        if (!this.signatureData) {
            this.showNotification('Signature client requise', 'warning');
            return;
        }

        this.showLoading(true);

        try {
            // Sauvegarde des observations
            await this.saveObservations();
            
            // Sauvegarde de la signature
            await this.saveSignature();
            
            // Finalisation de la mission
            await this.apiCall(`/missions/${this.currentMission.id}/status`, {
                method: 'PUT',
                body: JSON.stringify({ status: 'completed' })
            });

            this.showNotification('Inspection finalisée avec succès!', 'success');
            this.updateProgress(100);
            
        } catch (error) {
            this.showNotification('Erreur lors de la finalisation', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // Interface
    displayMissionDetails(mission) {
        const detailsEl = document.getElementById('missionDetails');
        const infoEl = document.getElementById('missionInfo');
        
        infoEl.innerHTML = `
            <div class="grid grid-2">
                <div>
                    <strong>Véhicule:</strong> ${mission.vehicle_brand} ${mission.vehicle_model} (${mission.vehicle_year || 'N/A'})
                </div>
                <div>
                    <strong>Plaque:</strong> ${mission.license_plate || 'N/A'}
                </div>
                <div>
                    <strong>Client:</strong> ${mission.client_name}
                </div>
                <div>
                    <strong>Code mission:</strong> ${mission.mission_code}
                </div>
            </div>
        `;
        
        detailsEl.style.display = 'block';
        this.updateProgress();
    }

    displayTrackingInfo(mission) {
        const resultEl = document.getElementById('trackingResult');
        const infoEl = document.getElementById('trackingInfo');
        
        infoEl.innerHTML = `
            <div class="grid grid-2">
                <div>
                    <strong>Véhicule:</strong> ${mission.vehicle_brand} ${mission.vehicle_model}
                </div>
                <div>
                    <strong>Statut:</strong> <span class="status-${mission.status}">${this.getStatusText(mission.status)}</span>
                </div>
                <div>
                    <strong>Date création:</strong> ${new Date(mission.created_at).toLocaleDateString('fr-FR')}
                </div>
                <div>
                    <strong>Code mission:</strong> ${mission.mission_code}
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
                if (downloadBtn) {
                    downloadBtn.onclick = () => this.downloadReport(mission.id);
                }
            }
        }
    }

    displayMissionLink(mission) {
        const listEl = document.getElementById('missionsList');
        if (!listEl) return;
        
        const missionEl = document.createElement('div');
        missionEl.className = 'mission-item';
        missionEl.innerHTML = `
            <div class="card">
                <h4>${mission.vehicle_brand} ${mission.vehicle_model} - ${mission.mission_code}</h4>
                <p><strong>Client:</strong> ${mission.client_name}</p>
                <p><strong>Lien prestataire:</strong> 
                    <a href="#" onclick="app.switchToPrestataire('${mission.mission_code}')">
                        Accéder à la mission
                    </a>
                </p>
                <p><strong>Lien client:</strong> 
                    <a href="#" onclick="app.switchToClient('${mission.mission_code}')">
                        Suivi client
                    </a>
                </p>
            </div>
        `;
        
        if (listEl.innerHTML.includes('Aucune mission')) {
            listEl.innerHTML = '';
        }
        listEl.appendChild(missionEl);
    }

    updateProgress() {
        const requiredPhotos = ['compteur', 'face-avant', 'face-arriere', 'cote-gauche', 'cote-droit', 'moteur', 'carnet', 'interieur'];
        const uploadedCount = requiredPhotos.filter(type => this.uploadedPhotos[type]).length;
        const progressPercent = (uploadedCount / requiredPhotos.length) * 50; // 50% pour les photos
        
        let currentStep = 1;
        if (uploadedCount > 0) currentStep = 2;
        if (uploadedCount === requiredPhotos.length) currentStep = 3;
        if (this.signatureData) currentStep = 4;
        
        // Mise à jour des étapes
        const steps = document.querySelectorAll('.progress-step');
        steps.forEach((step, index) => {
            step.classList.remove('active', 'completed');
            if (index + 1 < currentStep) {
                step.classList.add('completed');
                step.textContent = '✓';
            } else if (index + 1 === currentStep) {
                step.classList.add('active');
                step.textContent = index + 1;
            } else {
                step.textContent = index + 1;
            }
        });
        
        // Mise à jour de la ligne de progression
        const progressLine = document.getElementById('progressLine');
        if (progressLine) {
            const linePercent = ((currentStep - 1) / 3) * 100;
            progressLine.style.width = `${linePercent}%`;
        }
    }

    updateClientProgress(status) {
        const statusMap = {
            'pending': 1,
            'in_progress': 2,
            'completed': 4
        };
        
        const currentStep = statusMap[status] || 1;
        
        const steps = document.querySelectorAll('#trackingResult .progress-step');
        steps.forEach((step, index) => {
            step.classList.remove('active', 'completed');
            if (index + 1 < currentStep) {
                step.classList.add('completed');
                step.textContent = '✓';
            } else if (index + 1 === currentStep) {
                step.classList.add('active');
            }
        });
        
        const progressLine = document.getElementById('clientProgressLine');
        if (progressLine) {
            const linePercent = ((currentStep - 1) / 3) * 100;
            progressLine.style.width = `${linePercent}%`;
        }
    }

    async downloadReport(missionId) {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/${missionId}/pdf`);
            const blob = await response.blob();
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `rapport-mission-${missionId}.pdf`;
            a.click();
            
            URL.revokeObjectURL(url);
        } catch (error) {
            this.showNotification('Erreur téléchargement rapport', 'error');
        }
    }

    // Utilitaires
    getStatusText(status) {
        const statusTexts = {
            'pending': 'En attente',
            'in_progress': 'En cours',
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

    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = show ? 'flex' : 'none';
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        if (!notification) return;
        
        notification.textContent = message;
        notification.className = `notification ${type}`;
        
        // Affichage
        notification.classList.add('show');
        
        // Masquage automatique
        setTimeout(() => {
            notification.classList.remove('show');
        }, 4000);
    }
}

// Initialisation de l'application
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new FiableAutoApp();
});

// Gestion des erreurs globales
window.addEventListener('error', (e) => {
    console.error('Erreur application:', e.error);
    if (app) {
        app.showNotification('Une erreur est survenue', 'error');
    }
});

// Gestion de la connexion réseau
window.addEventListener('online', () => {
    if (app) {
        app.checkApiConnection();
        app.showNotification('Connexion rétablie', 'success');
    }
});

window.addEventListener('offline', () => {
    if (app) {
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) {
            statusEl.textContent = '🔴 Hors ligne';
            statusEl.className = 'connection-status offline';
        }
        app.showNotification('Connexion perdue', 'warning');
    }
});

// Auto-save des observations
let observationsTimeout;
document.addEventListener('DOMContentLoaded', () => {
    const observationsEl = document.getElementById('observations');
    if (observationsEl) {
        observationsEl.addEventListener('input', () => {
            clearTimeout(observationsTimeout);
            observationsTimeout = setTimeout(() => {
                if (app && app.currentMission) {
                    app.saveObservations();
                }
            }, 2000);
        });
    }
});

// Prevent zoom on iOS safari
document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) {
        e.preventDefault();
    }
});

let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        e.preventDefault();
    }
    lastTouchEnd = now;
}, false);
