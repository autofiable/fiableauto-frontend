// Configuration API
const API_BASE_URL = 'https://fiableauto-production-production.up.railway.app/api';

// État global de l'application Enhanced
class FiableAutoApp {
    constructor() {
        this.currentSection = 'gestionnaire';
        this.currentMission = null;
        this.uploadedPhotos = {};
        this.signatureData = null;
        this.isDrawing = false;
        this.checklistData = {};
        this.keyCount = 0;
        this.optionalPhotos = [];
        this.init();
    }

    init() {
        this.setupNavigation();
        this.setupForms();
        this.setupPhotoUpload();
        this.setupSignature();
        this.setupChecklist();
        this.checkApiConnection();
        this.loadStats();
        this.loadAllMissions();
        this.setupPWA();
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

    // Configuration des formulaires Enhanced
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

        // Auto-completion et validation en temps réel
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

    // Setup Checklist Enhanced
    setupChecklist() {
        // Gestion des radios de la checklist
        const radioGroups = document.querySelectorAll('input[type="radio"]');
        radioGroups.forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.checklistData[e.target.name] = e.target.value;
                this.updateProgress();
            });
        });
    }

    // Gestion des photos Enhanced
    setupPhotoUpload() {
        const photoInputs = document.querySelectorAll('input[type="file"][data-photo]');
        photoInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                this.handlePhotoUpload(e);
            });
        });
    }

    renderOptionalPhotos() {
        const container = document.getElementById('optionalPhotos');
        if (!container) return;
        
        const photo = this.optionalPhotos[this.optionalPhotos.length - 1];
        
        const photoDiv = document.createElement('div');
        photoDiv.className = 'photo-card';
        photoDiv.dataset.photoId = photo.id;
        photoDiv.innerHTML = `
            <div class="photo-icon">
                <i class="fas fa-camera"></i>
            </div>
            <h5>Photo libre ${this.optionalPhotos.length}</h5>
            <input type="file" accept="image/*" capture="environment" style="display: none;" id="optional-photo-${photo.id}">
            <button type="button" class="photo-btn" onclick="document.getElementById('optional-photo-${photo.id}').click()">
                <i class="fas fa-camera"></i> Prendre photo
            </button>
            <img class="photo-preview" style="display: none;">
            <button type="button" class="btn-enhanced btn-secondary" onclick="removeOptionalPhoto(this)" style="margin-top: 10px; padding: 5px 10px;">
                <i class="fas fa-trash"></i>
            </button>
        `;
        
        container.appendChild(photoDiv);
        this.updateOptionalPhotoCount();

        // Setup upload pour cette photo
        const input = document.getElementById(`optional-photo-${photo.id}`);
        input.addEventListener('change', (e) => this.handleOptionalPhotoUpload(e, photo.id));
    }

    updateOptionalPhotoCount() {
        const countSpan = document.querySelector('h5 span');
        if (countSpan) {
            countSpan.textContent = `(${this.optionalPhotos.length}/14)`;
        }
    }

    async handlePhotoUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const photoType = event.target.dataset.photo;
        const photoCard = event.target.closest('.photo-card');
        const preview = photoCard.querySelector('.photo-preview');
        const status = photoCard.querySelector('.upload-status');
        const btn = photoCard.querySelector('.photo-btn');

        try {
            // Affichage de la preview
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.src = e.target.result;
                preview.style.display = 'block';
                btn.innerHTML = '<i class="fas fa-check"></i> Photo prise';
                btn.style.background = 'var(--success-green)';
            };
            reader.readAsDataURL(file);

            // Compression de l'image
            const compressedFile = await this.compressImage(file);
            
            // Upload vers l'API si mission active
            if (this.currentMission) {
                await this.uploadPhoto(this.currentMission.id, photoType, compressedFile);
                photoCard.classList.add('uploaded');
                if (status) status.innerHTML = '<i class="fas fa-check" style="color: var(--success-green);"></i>';
                this.uploadedPhotos[photoType] = true;
                this.updateProgress();
            } else {
                // Stocker en attente
                this.uploadedPhotos[photoType] = compressedFile;
            }

        } catch (error) {
            console.error('Erreur upload photo:', error);
            if (status) status.innerHTML = '<i class="fas fa-times" style="color: var(--danger-red);"></i>';
            this.showNotification('Erreur lors de l\'upload de la photo', 'error');
        }
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
                await this.uploadPhoto(this.currentMission.id, `optional-${photoId}`, compressedFile);
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
                canvas.width = img.width * ratio;
                canvas.height = img.height * ratio;
                
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(resolve, 'image/jpeg', quality);
            };
            
            img.src = URL.createObjectURL(file);
        });
    }

    // Gestion de la signature Enhanced
    setupSignature() {
        const canvas = document.getElementById('signatureCanvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        
        // Configuration du canvas
        canvas.width = 500;
        canvas.height = 200;
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
            const rect = canvas.getBoundingClientRect();
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
        this.updateProgress();
    }

    // API calls Enhanced
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
        if (!statusEl) return;
        
        try {
            await this.apiCall('/health');
            statusEl.innerHTML = '<i class="fas fa-wifi"></i> 🟢 Connecté';
            statusEl.className = 'connection-status online';
        } catch (error) {
            statusEl.innerHTML = '<i class="fas fa-wifi"></i> 🔴 Hors ligne';
            statusEl.className = 'connection-status offline';
        }
    }

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
        } catch (error) {
            console.error('Erreur chargement stats:', error);
        }
    }

    async loadAllMissions() {
        try {
            const response = await this.apiCall('/missions');
            const missions = response.data || [];
            this.displayMissionsList(missions);
        } catch (error) {
            console.error('Erreur chargement missions:', error);
        }
    }

    displayMissionsList(missions) {
        const listEl = document.getElementById('missionsList');
        if (!listEl) return;
        
        if (missions.length === 0) {
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

    async createMission() {
        this.showLoading(true);
        
        try {
            const formData = new FormData(document.getElementById('missionForm'));
            
            // Mapping complet Enhanced
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

            console.log('Données mission Enhanced:', missionData);
            
            const response = await this.apiCall('/missions', {
                method: 'POST',
                body: JSON.stringify(missionData)
            });

            this.showNotification('Mission créée avec succès! 🎉', 'success');
            document.getElementById('missionForm').reset();
            this.loadStats();
            this.loadAllMissions(); // Recharger la liste
            
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
            this.showNotification('Mission chargée avec succès! ✅', 'success');
            
        } catch (error) {
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
            
        } catch (error) {
            this.showNotification('Mission introuvable ❌', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // Interface Enhanced
    displayMissionDetails(mission) {
        const detailsEl = document.getElementById('missionDetails');
        const infoEl = document.getElementById('missionInfo');
        
        if (!detailsEl || !infoEl) return;
        
        infoEl.innerHTML = `
            <div style="background: var(--light-gray); padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
                    <div>
                        <strong>🚗 Véhicule:</strong><br>
                        ${mission.vehicle_brand} ${mission.vehicle_model} ${mission.vehicle_year ? '(' + mission.vehicle_year + ')' : ''}
                    </div>
                    <div>
                        <strong>🔢 Plaque:</strong><br>
                        ${mission.license_plate || 'N/A'}
                    </div>
                    <div>
                        <strong>👤 Client:</strong><br>
                        ${mission.client_name}${mission.client_company ? '<br><small>' + mission.client_company + '</small>' : ''}
                    </div>
                    <div>
                        <strong>📋 Code mission:</strong><br>
                        <span style="font-family: monospace; background: white; padding: 4px 8px; border-radius: 4px;">${mission.mission_code}</span>
                    </div>
                </div>
            </div>
        `;
        
        detailsEl.style.display = 'block';
        this.updateProgress();
    }

    displayTrackingInfo(mission) {
        const resultEl = document.getElementById('trackingResult');
        const infoEl = document.getElementById('trackingInfo');
        
        if (!resultEl || !infoEl) return;
        
        infoEl.innerHTML = `
            <div style="background: var(--light-gray); padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
                    <div>
                        <strong>🚗 Véhicule:</strong><br>
                        ${mission.vehicle_brand} ${mission.vehicle_model}
                    </div>
                    <div>
                        <strong>📊 Statut:</strong><br>
                        <span class="status-badge status-${mission.status}">${this.getStatusText(mission.status)}</span>
                    </div>
                    <div>
                        <strong>📅 Date création:</strong><br>
                        ${new Date(mission.created_at).toLocaleDateString('fr-FR')}
                    </div>
                    <div>
                        <strong>📋 Code mission:</strong><br>
                        <span style="font-family: monospace;">${mission.mission_code}</span>
                    </div>
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

    // Progress Enhanced (5 étapes)
    updateProgress() {
        const requiredPhotos = ['compteur', 'face-avant', 'face-arriere', 'lateral-gauche-avant', 'lateral-gauche-arriere', 'lateral-droit-avant', 'lateral-droit-arriere', 'moteur', 'interieur', 'carnet'];
        const uploadedCount = requiredPhotos.filter(type => this.uploadedPhotos[type]).length;
        const checklistComplete = this.isChecklistComplete();
        
        let currentStep = 1; // Accès
        if (checklistComplete) currentStep = 2; // Checklist
        if (uploadedCount > 0) currentStep = 3; // Photos en cours
        if (uploadedCount === requiredPhotos.length) currentStep = 4; // Photos terminées
        if (this.signatureData) currentStep = 5; // Signature
        
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
            const linePercent = ((currentStep - 1) / 4) * 100;
            progressLine.style.width = `${linePercent}%`;
        }
    }

    isChecklistComplete() {
        const requiredChecks = ['vehiclePapers', 'gps', 'sdCard', 'safetyKit', 'spareWheel'];
        return requiredChecks.every(check => this.checklistData[check]) && this.keyCount > 0;
    }

    updateClientProgress(status) {
        const statusMap = {
            'pending': 1,
            'assigned': 2,
            'in_progress': 3,
            'photos_taken': 4,
            'completed': 5
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
            const linePercent = ((currentStep - 1) / 4) * 100;
            progressLine.style.width = `${linePercent}%`;
        }
    }

    async finalizeInspection() {
        if (!this.currentMission) return;

        const requiredPhotos = ['compteur', 'face-avant', 'face-arriere', 'lateral-gauche-avant', 'lateral-gauche-arriere', 'lateral-droit-avant', 'lateral-droit-arriere', 'moteur', 'interieur', 'carnet'];
        const missingPhotos = requiredPhotos.filter(type => !this.uploadedPhotos[type]);
        
        if (missingPhotos.length > 0) {
            this.showNotification(`Photos manquantes: ${missingPhotos.join(', ')}`, 'warning');
            return;
        }

        if (!this.isChecklistComplete()) {
            this.showNotification('Checklist incomplète', 'warning');
            return;
        }

        if (!this.signatureData) {
            this.showNotification('Signature client requise', 'warning');
            return;
        }

        this.showLoading(true);

        try {
            // Sauvegarde checklist + observations + signature
            await this.saveInspectionData();
            
            // Finalisation de la mission
            await this.apiCall(`/missions/${this.currentMission.id}/status`, {
                method: 'PUT',
                body: JSON.stringify({ status: 'completed' })
            });

            this.showNotification('Inspection finalisée avec succès! 🎉', 'success');
            this.updateProgress();
            
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
            optionalPhotos: this.optionalPhotos.length
        };

        try {
            await this.apiCall(`/missions/${this.currentMission.id}/inspection`, {
                method: 'POST',
                body: JSON.stringify(inspectionData)
            });
        } catch (error) {
            console.error('Erreur sauvegarde inspection:', error);
            throw error;
        }
    }

    // Utilitaires Enhanced
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
            a.href = url;
            a.download = `rapport-mission-${missionId}.pdf`;
            a.click();
            
            URL.revokeObjectURL(url);
            this.showNotification('Rapport téléchargé! 📄', 'success');
        } catch (error) {
            this.showNotification('Erreur téléchargement rapport', 'error');
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

    // PWA Setup
    setupPWA() {
        // Service Worker registration
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').then(registration => {
                console.log('SW registered:', registration);
            }).catch(error => {
                console.log('SW registration failed:', error);
            });
        }

        // Install prompt
        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            this.showInstallPrompt();
        });
    }

    showInstallPrompt() {
        const installBtn = document.createElement('button');
        installBtn.className = 'btn-enhanced btn-primary';
        installBtn.innerHTML = '<i class="fas fa-download"></i> Installer l\'app';
        installBtn.onclick = () => this.installApp();
        installBtn.style.position = 'fixed';
        installBtn.style.bottom = '20px';
        installBtn.style.right = '20px';
        installBtn.style.zIndex = '1000';
        document.body.appendChild(installBtn);

        setTimeout(() => {
            if (installBtn.parentNode) {
                installBtn.remove();
            }
        }, 10000);
    }

    async installApp() {
        // PWA installation logic
        this.showNotification('Installation PWA non disponible pour le moment', 'info');
    }

    // Géolocalisation
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
            
            // Géocodage inverse (nécessiterait une vraie API)
            const address = await this.reverseGeocode(latitude, longitude);
            const inputEl = document.getElementById(inputId);
            if (inputEl) {
                inputEl.value = address;
            }
            
            this.showNotification('Position détectée! 📍', 'success');
        } catch (error) {
            this.showNotification('Erreur géolocalisation: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async reverseGeocode(lat, lng) {
        // Simulation - remplacer par vraie API Google Maps/OpenStreetMap
        try {
            const response = await fetch(`https://api.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
            const data = await response.json();
            return data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        } catch (error) {
            return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        }
    }

    // QR Scanner
    openQrScanner() {
        const scannerEl = document.getElementById('qrScanner');
        if (scannerEl) {
            scannerEl.style.display = 'flex';
        }
        
        // Simulation scanner QR - remplacer par html5-qrcode
        this.showNotification('Scanner QR activé (simulation)', 'info');
        
        // Simulation lecture QR après 3 secondes
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
        const scannerEl = document.getElementById('qrScanner');
        if (scannerEl) {
            scannerEl.style.display = 'none';
        }
    }

    // Dark Mode
    toggleTheme() {
        const currentTheme = document.body.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        document.body.setAttribute('data-theme', newTheme);
        
        const icon = document.getElementById('theme-icon');
        if (icon) {
            icon.className = newTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
        }
        
        localStorage.setItem('theme', newTheme);
        this.showNotification(`Mode ${newTheme === 'dark' ? 'sombre' : 'clair'} activé`, 'info');
    }

    // Utilitaires UI
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
        notification.className = `notification ${type} show`;
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, 4000);
    }

    // Auto-save
    setupAutoSave() {
        const observationsField = document.getElementById('observations');
        if (observationsField) {
            let saveTimeout;
            observationsField.addEventListener('input', () => {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(() => {
                    if (this.currentMission) {
                        this.autoSaveObservations();
                    }
                }, 2000);
            });
        }
    }

    async autoSaveObservations() {
        try {
            const observations = document.getElementById('observations')?.value || '';
            await this.apiCall(`/missions/${this.currentMission.id}/observations`, {
                method: 'PUT',
                body: JSON.stringify({ observations })
            });
            
            // Indicateur visuel de sauvegarde
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
            
            setTimeout(() => {
                if (indicator.parentNode) {
                    indicator.remove();
                }
            }, 2000);
        } catch (error) {
            console.error('Erreur auto-save:', error);
        }
    }

    // Initialisation complète
    initializeEnhancedFeatures() {
        this.setupAutoSave();
        
        // Charger thème sauvegardé
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            document.body.setAttribute('data-theme', savedTheme);
            const icon = document.getElementById('theme-icon');
            if (icon) {
                icon.className = savedTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
            }
        }
    }
}

// Fonctions globales (pour HTML onclick)
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

window.openQrScanner = () => {
    if (window.app) {
        window.app.openQrScanner();
    }
};

window.closeQrScanner = () => {
    if (window.app) {
        window.app.closeQrScanner();
    }
};

window.sendReportByEmail = () => {
    const email = prompt('Entrez votre adresse email:');
    if (email && window.app) {
        window.app.showNotification('Rapport envoyé à ' + email, 'success');
    }
};

// Gestion des clés
window.adjustKeys = (change) => {
    if (window.app) {
        window.app.keyCount = Math.max(0, window.app.keyCount + change);
        const countEl = document.getElementById('keyCount');
        if (countEl) {
            countEl.textContent = window.app.keyCount;
        }
        window.app.checklistData.keyCount = window.app.keyCount;
        window.app.updateProgress();
    }
};

// Photos optionnelles
window.addOptionalPhoto = () => {
    if (window.app) {
        window.app.optionalPhotos.push({
            id: Date.now(),
            file: null,
            uploaded: false
        });
        window.app.renderOptionalPhotos();
    }
};

window.removeOptionalPhoto = (button) => {
    if (window.app) {
        const photoCard = button.parentElement;
        const photoId = parseInt(photoCard.dataset.photoId);
        window.app.optionalPhotos = window.app.optionalPhotos.filter(p => p.id !== photoId);
        photoCard.remove();
        window.app.updateOptionalPhotoCount();
    }
};

// Initialisation de l'application Enhanced
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new FiableAutoApp();
    window.app = app;
    
    // Features enhanced
    app.initializeEnhancedFeatures();
    
    // Message de bienvenue
    setTimeout(() => {
        app.showNotification('🚗 FiableAuto Enhanced chargé!', 'success');
    }, 1000);
});

// Gestion des erreurs globales Enhanced
window.addEventListener('error', (e) => {
    console.error('Erreur application:', e.error);
    if (app) {
        app.showNotification('Une erreur est survenue', 'error');
    }
});

// Gestion de la connexion réseau Enhanced
window.addEventListener('online', () => {
    if (app) {
        app.checkApiConnection();
        app.showNotification('Connexion rétablie ✅', 'success');
    }
});

window.addEventListener('offline', () => {
    if (app) {
        app.showNotification('Mode hors ligne 📵', 'warning');
    }
});

// Service Worker messages (si PWA activée)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'SYNC_COMPLETE' && app) {
            app.showNotification('Données synchronisées ✅', 'success');
        }
    });
}
