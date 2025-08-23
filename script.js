// Configuration API
const API_BASE_URL = 'https://fiableauto-production-production.up.railway.app/api';

class FiableAutoApp {
    constructor() {
        this.currentSection = 'gestionnaire';
        this.currentMission = null;

        // Phases EDL + états
        this.edlPhase = 'depart';              // 'depart' | 'arrivee'
        this.departValidated = false;          // validation EDL Départ

        // Photos & previews par phase
        this.uploadedPhotos = { depart: {}, arrivee: {} };
        this.previewsDataURL = { depart: {}, arrivee: {} };

        // Signature (arrivée)
        this.signatureData = null;
        this.isDrawing = false;

        // Checklist / clés
        this.checklistData = {};
        this.keyCount = 0;

        // Optionnelles
        this.optionalPhotos = [];

        // Liste des photos obligatoires
        this.requiredPhotos = [
            'compteur','face-avant','face-arriere',
            'lateral-gauche-avant','lateral-gauche-arriere',
            'lateral-droit-avant','lateral-droit-arriere',
            'moteur','interieur','carnet'
        ];

        this.init();
    }

    init() {
        this.setupNavigation();
        this.setupForms();
        this.setupChecklist();
        this.setupPhotoUpload();
        this.setupEdlPhase();
        this.setupDepartValidation();
        this.setupSignature();

        this.checkApiConnection();
        this.loadStats();
        this.loadAllMissions();
        this.setupPWA();
        this.initializeEnhancedFeatures();
    }

    // ---------- Navigation ----------
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
            });
        });
    }

    // ---------- Forms ----------
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
        field.style.borderColor = (required && !value) ? 'var(--danger-red)' : 'var(--border-color)';
        return !(required && !value);
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

    // ---------- Checklist ----------
    setupChecklist() {
        const radios = document.querySelectorAll('input[type="radio"]');
        radios.forEach(r => r.addEventListener('change', (e) => {
            this.checklistData[e.target.name] = e.target.value;
            this.updateProgress();
        }));
    }

    isChecklistComplete() {
        const requiredChecks = ['vehiclePapers','gps','sdCard','safetyKit','spareWheel'];
        return requiredChecks.every(k => this.checklistData[k]) && this.keyCount > 0;
    }

    // ---------- Phase EDL ----------
    setupEdlPhase() {
        const radios = document.querySelectorAll('input[name="edlPhase"]');
        const signatureBlock = document.getElementById('signatureBlock');
        const badge = document.getElementById('phaseBadge');

        const applyPhaseUI = () => {
            if (signatureBlock) signatureBlock.style.display = (this.edlPhase === 'arrivee') ? '' : 'none';
            if (badge) badge.textContent = (this.edlPhase === 'arrivee') ? '(Arrivée)' : '(Départ)';
            this.refreshPhotoPreviewsForPhase(this.edlPhase);
        };

        radios.forEach(r => {
            r.addEventListener('change', (e) => {
                const wanted = r.value;
                if (wanted === 'arrivee' && !this.departValidated) {
                    e.preventDefault();
                    r.checked = false;
                    const dep = [...radios].find(x => x.value === 'depart');
                    if (dep) dep.checked = true;
                    this.edlPhase = 'depart';
                    this.showNotification('Valide d’abord l’EDL Départ pour passer à l’Arrivée.', 'warning');
                    return;
                }
                this.edlPhase = wanted;
                applyPhaseUI();
            });
        });

        this.edlPhase = [...radios].find(r => r.checked)?.value || 'depart';
        applyPhaseUI();
    }

    // ---------- Validation EDL Départ ----------
    setupDepartValidation() {
        const btn = document.getElementById('validateDepartBtn');
        const label = document.getElementById('departValidLabel');
        if (!btn || !label) return;
        btn.addEventListener('click', async () => {
            const ok = this.canValidateDepart();
            if (!ok.pass) { this.showNotification(ok.msg, 'warning'); return; }

            try {
                if (this.currentMission) {
                    // Utiliser un statut autorisé par le backend
                    await this.apiCall(`/missions/${this.currentMission.id}/status`, {
                        method: 'PUT',
                        body: JSON.stringify({ status: 'photos_taken' })
                    });
                }
                this.departValidated = true;
                label.textContent = 'Validé';
                label.style.color = 'var(--success-green)';
                this.showNotification('EDL Départ validé ✅ Vous pouvez passer à l’Arrivée.', 'success');
            } catch {
                this.showNotification("Impossible de valider l'EDL Départ", 'error');
            }
        });
    }

    canValidateDepart() {
        if (!this.isChecklistComplete()) {
            return { pass:false, msg:'Checklist incomplète (cochez toutes les cases et indiquez le nombre de clés).' };
        }
        const missing = this.requiredPhotos.filter(t => !this.uploadedPhotos.depart[t]);
        if (missing.length) {
            return { pass:false, msg:`Photos Départ manquantes : ${missing.join(', ')}` };
        }
        return { pass:true };
    }

    // ---------- Photos ----------
    setupPhotoUpload() {
        const inputs = document.querySelectorAll('input[type="file"][data-photo]');
        inputs.forEach(inp => inp.addEventListener('change', (e) => this.handlePhotoUpload(e)));
    }

    async handlePhotoUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const phase = this.edlPhase;
        const type = event.target.dataset.photo;

        // Verrou Départ si déjà validé
        if (phase === 'depart' && this.departValidated) {
            this.showNotification('EDL Départ déjà validé — modification impossible. Passe en Arrivée.', 'warning');
            event.target.value = '';
            return;
        }

        const card = event.target.closest('.photo-card');
        const preview = card.querySelector('.photo-preview');
        const status = card.querySelector('.upload-status');
        const btn = card.querySelector('.photo-btn');

        try {
            const reader = new FileReader();
            reader.onload = (e) => {
                const dataUrl = e.target.result;
                preview.src = dataUrl; preview.style.display = 'block';
                btn.innerHTML = '<i class="fas fa-check"></i> Photo prise';
                btn.style.background = 'var(--success-green)';
                this.previewsDataURL[phase][type] = dataUrl;
            };
            reader.readAsDataURL(file);

            const compressed = await this.compressImage(file);

            if (this.currentMission) {
                // IMPORTANT: photoType encodé avec la phase ('depart:compteur', 'arrivee:compteur', etc.)
                await this.uploadPhoto(this.currentMission.id, `${phase}:${type}`, compressed);
                card.classList.add('uploaded');
                if (status) status.innerHTML = '<i class="fas fa-check" style="color: var(--success-green);"></i>';
                this.uploadedPhotos[phase][type] = true;
                this.updateProgress();
            } else {
                this.uploadedPhotos[phase][type] = compressed;
            }
        } catch (e) {
            console.error('Erreur upload photo:', e);
            if (status) status.innerHTML = '<i class="fas fa-times" style="color: var(--danger-red);"></i>';
            this.showNotification('Erreur lors de l\'upload de la photo', 'error');
        }
    }

    refreshPhotoPreviewsForPhase(phase) {
        document.querySelectorAll('.photo-card').forEach(card => {
            const type = card.getAttribute('data-type') || card.querySelector('[data-photo]')?.dataset.photo;
            const preview = card.querySelector('.photo-preview');
            const btn = card.querySelector('.photo-btn');
            const has = type && this.previewsDataURL[phase][type];

            if (preview && btn) {
                if (has) {
                    preview.src = this.previewsDataURL[phase][type];
                    preview.style.display = 'block';
                    btn.innerHTML = '<i class="fas fa-check"></i> Photo prise';
                    btn.style.background = 'var(--success-green)';
                    card.classList.add('uploaded');
                } else {
                    preview.style.display = 'none';
                    btn.innerHTML = '<i class="fas fa-camera"></i> Prendre photo';
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

        const card = event.target.closest('.photo-card');
        const preview = card.querySelector('.photo-preview');
        const btn = card.querySelector('.photo-btn');

        try {
            const compressed = await this.compressImage(file);
            photo.file = compressed;

            const reader = new FileReader();
            reader.onload = (e) => {
                preview.src = e.target.result;
                preview.style.display = 'block';
                btn.innerHTML = '<i class="fas fa-check"></i> Photo prise';
                btn.style.background = 'var(--success-green)';
            };
            reader.readAsDataURL(compressed);

            if (this.currentMission) {
                await this.uploadPhoto(this.currentMission.id, `optional-${photoId}`, compressed);
                photo.uploaded = true;
            }
        } catch (e) {
            console.error('Erreur upload photo optionnelle:', e);
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

    // ---------- Signature (Arrivée) ----------
    setupSignature() {
        const canvas = document.getElementById('signatureCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        canvas.width = 500; canvas.height = 200;
        ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.lineCap = 'round';

        const start = (e) => {
            if (this.edlPhase !== 'arrivee') { this.showNotification("La signature n'est possible qu'à l'arrivée.", 'warning'); return; }
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
            ctx.lineTo(x, y); ctx.stroke();
        };
        const end = () => {
            if (!this.isDrawing) return;
            this.isDrawing = false;
            this.signatureData = canvas.toDataURL();
            this.updateProgress();
        };

        canvas.addEventListener('mousedown', start);
        canvas.addEventListener('mousemove', move);
        window.addEventListener('mouseup', end);
        canvas.addEventListener('touchstart', (e)=>{ e.preventDefault(); start(e); }, {passive:false});
        canvas.addEventListener('touchmove', (e)=>{ e.preventDefault(); move(e); }, {passive:false});
        canvas.addEventListener('touchend', (e)=>{ e.preventDefault(); end(e); }, {passive:false});

        const clearBtn = document.getElementById('clearSignature');
        if (clearBtn) clearBtn.addEventListener('click', () => { ctx.clearRect(0,0,canvas.width,canvas.height); this.signatureData = null; });

        const finalizeBtn = document.getElementById('finalizeInspection');
        if (finalizeBtn) finalizeBtn.addEventListener('click', () => this.finalizeInspection());
    }

    // ---------- API ----------
    async apiCall(endpoint, options = {}) {
        const url = `${API_BASE_URL}${endpoint}`;
        const fetchOptions = {
            headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) },
            ...options
        };
        const res = await fetch(url, fetchOptions);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return await res.json();
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

    // ---------- Dashboard ----------
    async loadStats() {
        try {
            const resp = await this.apiCall('/stats');
            const stats = resp.data || resp;
            (document.getElementById('totalMissions')||{}).textContent = stats.total || 0;
            (document.getElementById('pendingMissions')||{}).textContent = stats.pending || 0;
            (document.getElementById('completedMissions')||{}).textContent = stats.completed || 0;
            (document.getElementById('progressMissions')||{}).textContent = stats.in_progress || 0;
        } catch (e) { console.error('Erreur chargement stats:', e); }
    }

    async loadAllMissions() {
        try {
            const resp = await this.apiCall('/missions');
            const missions = resp.data || [];
            this.displayMissionsList(missions);
        } catch (e) { console.error('Erreur chargement missions:', e); }
    }

    displayMissionsList(missions) {
        const list = document.getElementById('missionsList');
        if (!list) return;
        if (!missions.length) {
            list.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Aucune mission créée pour le moment.</p>';
            return;
        }
        list.innerHTML = missions.map(m => `
            <div class="mission-item">
                <div class="mission-header">
                    <h4>${m.vehicle_brand} ${m.vehicle_model} - ${m.mission_code}</h4>
                    <span class="status-badge status-${m.status}">${this.getStatusText(m.status)}</span>
                </div>
                <div class="mission-details">
                    <p><strong>Client:</strong> ${m.client_name}</p>
                    <p><strong>Email:</strong> ${m.client_email}</p>
                    <p><strong>Téléphone:</strong> ${m.client_phone || 'N/A'}</p>
                    <p><strong>Date création:</strong> ${new Date(m.created_at).toLocaleDateString('fr-FR')}</p>
                    <p><strong>Lieu prise en charge:</strong> ${m.pickup_location}</p>
                    <p><strong>Lieu livraison:</strong> ${m.delivery_location}</p>
                </div>
                <div class="mission-actions">
                    <button onclick="app.switchToPrestataire('${m.mission_code}')" class="btn-secondary">👨‍🔧 Interface Prestataire</button>
                    <button onclick="app.switchToClient('${m.mission_code}')" class="btn-secondary">👤 Suivi Client</button>
                    ${m.status === 'completed' ? `<button onclick="app.downloadReport(${m.id})" class="btn-success">📄 Télécharger Rapport</button>` : ''}
                </div>
            </div>
        `).join('');
    }

    // ---------- Missions ----------
    async createMission() {
        this.showLoading(true);
        try {
            const fd = new FormData(document.getElementById('missionForm'));
            const data = {
                vehicleBrand: fd.get('vehicleBrand'), vehicleModel: fd.get('vehicleModel'),
                vehicleYear: fd.get('vehicleYear'), licensePlate: fd.get('licensePlate'),
                mileage: fd.get('mileage'), fuelLevel: fd.get('fuelLevel'),
                interiorCondition: fd.get('interiorCondition'), exteriorCondition: fd.get('exteriorCondition'),
                pickupLocation: fd.get('pickupLocation'), deliveryLocation: fd.get('deliveryLocation'),
                pickupDate: fd.get('pickupDate'), deliveryDate: fd.get('deliveryDate'),
                urgency: fd.get('urgency') || 'normal', missionType: fd.get('missionType') || 'inspection',
                clientName: fd.get('clientName'), clientEmail: fd.get('clientEmail'),
                clientPhone: fd.get('clientPhone'), clientCompany: fd.get('clientCompany')
            };
            await this.apiCall('/missions', { method: 'POST', body: JSON.stringify(data) });
            this.showNotification('Mission créée avec succès! 🎉', 'success');
            document.getElementById('missionForm').reset();
            this.loadStats(); this.loadAllMissions();
        } catch (e) {
            console.error('Erreur création mission:', e);
            this.showNotification('Erreur lors de la création de la mission', 'error');
        } finally { this.showLoading(false); }
    }

    async accessMission(code) {
        this.showLoading(true);
        try {
            const resp = await this.apiCall(`/missions/${code}`);
            this.currentMission = resp.data;
            this.displayMissionDetails(resp.data);
            this.showNotification('Mission chargée avec succès! ✅', 'success');
            this.updateProgress(true);

            // Optionnel: marquer "in_progress" à l'accès
            try {
                await this.apiCall(`/missions/${this.currentMission.id}/status`, {
                    method: 'PUT',
                    body: JSON.stringify({ status: 'in_progress' })
                });
            } catch(_) {}
        } catch {
            this.showNotification('Mission introuvable ❌', 'error');
        } finally { this.showLoading(false); }
    }

    async trackMission(code) {
        this.showLoading(true);
        try {
            const resp = await this.apiCall(`/missions/${code}`);
            this.displayTrackingInfo(resp.data);
            this.showNotification('Mission trouvée! ✅', 'success');
        } catch {
            this.showNotification('Mission introuvable ❌', 'error');
        } finally { this.showLoading(false); }
    }

    displayMissionDetails(m) {
        const details = document.getElementById('missionDetails');
        const info = document.getElementById('missionInfo');
        if (!details || !info) return;
        info.innerHTML = `
            <div style="background: var(--light-gray); padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
                    <div><strong>🚗 Véhicule:</strong><br>${m.vehicle_brand} ${m.vehicle_model} ${m.vehicle_year ? '(' + m.vehicle_year + ')' : ''}</div>
                    <div><strong>🔢 Plaque:</strong><br>${m.license_plate || 'N/A'}</div>
                    <div><strong>👤 Client:</strong><br>${m.client_name}${m.client_company ? '<br><small>' + m.client_company + '</small>' : ''}</div>
                    <div><strong>📋 Code mission:</strong><br><span style="font-family: monospace; background: white; padding: 4px 8px; border-radius: 4px;">${m.mission_code}</span></div>
                </div>
            </div>
        `;
        details.style.display = 'block';
        this.refreshPhotoPreviewsForPhase(this.edlPhase);
    }

    displayTrackingInfo(m) {
        const result = document.getElementById('trackingResult');
        const info = document.getElementById('trackingInfo');
        if (!result || !info) return;
        info.innerHTML = `
            <div style="background: var(--light-gray); padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
                    <div><strong>🚗 Véhicule:</strong><br>${m.vehicle_brand} ${m.vehicle_model}</div>
                    <div><strong>📊 Statut:</strong><br><span class="status-badge status-${m.status}">${this.getStatusText(m.status)}</span></div>
                    <div><strong>📅 Date création:</strong><br>${new Date(m.created_at).toLocaleDateString('fr-FR')}</div>
                    <div><strong>📋 Code mission:</strong><br><span style="font-family: monospace;">${m.mission_code}</span></div>
                </div>
            </div>
        `;
        result.style.display = 'block';
        this.updateClientProgress(m.status);
        if (m.status === 'completed') {
            const dl = document.getElementById('downloadSection');
            if (dl) {
                dl.style.display = 'block';
                const btn = document.getElementById('downloadReport');
                if (btn) btn.onclick = () => this.downloadReport(m.id);
            }
        }
    }

    // ---------- Progress ----------
    updateProgress(onAccess = false) {
        const departCount = this.requiredPhotos.filter(t => this.uploadedPhotos.depart[t]).length;

        let current = 1;
        if (onAccess || this.currentMission) current = 1;
        if (this.isChecklistComplete()) current = 2;
        if (departCount > 0) current = 3;
        if (departCount === this.requiredPhotos.length) current = 4;
        if (this.signatureData) current = 5;

        const steps = document.querySelectorAll('#missionDetails .progress-step');
        steps.forEach((s, i) => {
            s.classList.remove('active','completed');
            if (i + 1 < current) { s.classList.add('completed'); s.textContent = '✓'; }
            else if (i + 1 === current) { s.classList.add('active'); s.textContent = (i + 1); }
            else { s.textContent = (i + 1); }
        });
        const line = document.getElementById('progressLine');
        if (line) line.style.width = `${((current - 1) / 4) * 100}%`;
    }

    updateClientProgress(status) {
        const map = { pending:1, assigned:2, in_progress:3, photos_taken:4, completed:5 };
        const current = map[status] || 1;
        const steps = document.querySelectorAll('#trackingResult .progress-step');
        steps.forEach((s, i) => {
            s.classList.remove('active','completed');
            if (i + 1 < current) { s.classList.add('completed'); s.textContent = '✓'; }
            else if (i + 1 === current) s.classList.add('active');
            else s.textContent = i + 1;
        });
        const line = document.getElementById('clientProgressLine');
        if (line) line.style.width = `${((current - 1) / 4) * 100}%`;
    }

    // ---------- Finalisation ----------
    async finalizeInspection() {
        if (!this.currentMission) return;

        if (!this.departValidated) {
            this.showNotification("Valide d'abord l'EDL Départ.", 'warning'); return;
        }
        const missingDepart = this.requiredPhotos.filter(t => !this.uploadedPhotos.depart[t]);
        const missingArrivee = this.requiredPhotos.filter(t => !this.uploadedPhotos.arrivee[t]);
        if (missingDepart.length) { this.showNotification(`Photos Départ manquantes: ${missingDepart.join(', ')}`, 'warning'); return; }
        if (missingArrivee.length) { this.showNotification(`Photos Arrivée manquantes: ${missingArrivee.join(', ')}`, 'warning'); return; }
        if (!this.isChecklistComplete()) { this.showNotification('Checklist incomplète', 'warning'); return; }
        if (this.edlPhase !== 'arrivee') { this.showNotification("La signature et la finalisation ne sont possibles qu’à l'arrivée.", 'warning'); return; }
        if (!this.signatureData) { this.showNotification('Signature client requise', 'warning'); return; }

        this.showLoading(true);
        try {
            await this.saveInspectionData();
            await this.apiCall(`/missions/${this.currentMission.id}/status`, { method: 'PUT', body: JSON.stringify({ status: 'completed' }) });
            this.showNotification('Inspection finalisée avec succès! 🎉', 'success');
            this.updateProgress();

            const finish = document.getElementById('finishScreen');
            const details = document.getElementById('missionDetails');
            const homeBtn = document.getElementById('goPrestataireHome');
            if (finish) finish.style.display = '';
            const goHome = () => {
                if (details) details.style.display = 'none';
                const prestTab = document.querySelector('[data-section="prestataire"]');
                const sections = document.querySelectorAll('.section');
                const pills = document.querySelectorAll('.nav-pill');
                pills.forEach(b => b.classList.remove('active'));
                prestTab && prestTab.classList.add('active');
                sections.forEach(s => s.classList.remove('active'));
                document.getElementById('prestataire')?.classList.add('active');
                window.scrollTo({ top: 0, behavior: 'smooth' });
                if (finish) finish.style.display = 'none';
            };
            setTimeout(goHome, 6000);
            if (homeBtn) homeBtn.onclick = goHome;
        } catch {
            this.showNotification('Erreur lors de la finalisation', 'error');
        } finally { this.showLoading(false); }
    }

    async saveInspectionData() {
        if (!this.currentMission) return;
        const observations = document.getElementById('observations')?.value || '';
        const payload = {
            observations,
            signature: this.signatureData,
            checklist: this.checklistData,
            keyCount: this.keyCount,
            optionalPhotos: this.optionalPhotos.length
        };
        await this.apiCall(`/missions/${this.currentMission.id}/inspection`, { method: 'POST', body: JSON.stringify(payload) });
    }

    // ---------- Utils / API spés ----------
    getStatusText(s) {
        const map = { pending:'En attente', assigned:'Assignée', in_progress:'En cours', photos_taken:'Photos prises', completed:'Terminée', cancelled:'Annulée' };
        return map[s] || s;
    }

    switchToPrestataire(code) {
        const tab = document.querySelector('[data-section="prestataire"]');
        if (tab) {
            tab.click();
            setTimeout(() => {
                const input = document.getElementById('missionCode');
                const form = document.getElementById('accessForm');
                if (input && form) { input.value = code; form.dispatchEvent(new Event('submit')); }
            }, 100);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    switchToClient(code) {
        const tab = document.querySelector('[data-section="client"]');
        if (tab) {
            tab.click();
            setTimeout(() => {
                const input = document.getElementById('trackingCode');
                const form = document.getElementById('trackingForm');
                if (input && form) { input.value = code; form.dispatchEvent(new Event('submit')); }
            }, 100);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async downloadReport(id) {
        try {
            const res = await fetch(`${API_BASE_URL}/reports/${id}/pdf`);
            if (!res.ok) throw new Error('Erreur téléchargement');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `rapport-mission-${id}.pdf`; a.click();
            URL.revokeObjectURL(url);
            this.showNotification('Rapport téléchargé! 📄', 'success');
        } catch { this.showNotification('Erreur téléchargement rapport', 'error'); }
    }

    async uploadPhoto(missionId, photoType, file) {
        const formData = new FormData();
        formData.append('photo', file);
        formData.append('photoType', photoType); // ex: 'depart:compteur' ou 'arrivee:compteur'
        const res = await fetch(`${API_BASE_URL}/uploads/photos/${missionId}`, { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Erreur upload photo');
        return res.json();
    }

    // ---------- PWA ----------
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
        const btn = document.createElement('button');
        btn.className = 'btn-enhanced btn-primary';
        btn.innerHTML = '<i class="fas fa-download"></i> Installer l\'app';
        btn.onclick = async () => {
            if (!deferredPrompt) return this.showNotification('Installation indisponible', 'info');
            deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; btn.remove();
        };
        btn.style.position = 'fixed'; btn.style.bottom = '20px'; btn.style.right = '20px'; btn.style.zIndex = '1000';
        document.body.appendChild(btn); setTimeout(()=>btn.remove(), 10000);
    }

    // ---------- Géoloc ----------
    async getCurrentLocation(inputId) {
        if (!navigator.geolocation) { this.showNotification('Géolocalisation non supportée', 'error'); return; }
        this.showLoading(true);
        try {
            const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy:true, timeout:10000, maximumAge:60000 }));
            const { latitude, longitude } = pos.coords;
            const address = await this.reverseGeocode(latitude, longitude);
            const input = document.getElementById(inputId);
            if (input) input.value = address;
            this.showNotification('Position détectée! 📍', 'success');
        } catch (e) {
            this.showNotification('Erreur géolocalisation: ' + e.message, 'error');
        } finally { this.showLoading(false); }
    }

    async reverseGeocode(lat, lng) {
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
            const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
            const d = await r.json();
            return d.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        } catch { return `${lat.toFixed(6)}, ${lng.toFixed(6)}`; }
    }

    // ---------- QR ----------
    openQrScanner() {
        const el = document.getElementById('qrScanner');
        if (el) el.style.display = 'flex';
        this.showNotification('Scanner QR activé (simulation)', 'info');
        setTimeout(() => {
            const code = 'FA-20250823-001';
            if (this.currentSection === 'prestataire') document.getElementById('missionCode').value = code;
            else if (this.currentSection === 'client') document.getElementById('trackingCode').value = code;
            this.closeQrScanner();
            this.showNotification(`QR Code lu: ${code}`, 'success');
        }, 3000);
    }
    closeQrScanner() { const el = document.getElementById('qrScanner'); if (el) el.style.display = 'none'; }

    // ---------- Thème ----------
    toggleTheme() {
        const cur = document.body.getAttribute('data-theme') || 'light';
        const next = cur === 'light' ? 'dark' : 'light';
        document.body.setAttribute('data-theme', next);
        const icon = document.getElementById('theme-icon');
        if (icon) icon.className = next === 'light' ? 'fas fa-moon' : 'fas fa-sun';
        localStorage.setItem('theme', next);
        this.showNotification(`Mode ${next === 'dark' ? 'sombre' : 'clair'} activé`, 'info');
    }

    // ---------- UI utils ----------
    showLoading(show) { const o = document.getElementById('loadingOverlay'); if (o) o.style.display = show ? 'flex' : 'none'; }
    showNotification(message, type = 'info') {
        const n = document.getElementById('notification');
        if (!n) return alert(message);
        n.textContent = message; n.className = `notification ${type} show`;
        setTimeout(() => n.classList.remove('show'), 4000);
    }

    // ---------- Auto-save ----------
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
            await this.apiCall(`/missions/${this.currentMission.id}/observations`, { method: 'PUT', body: JSON.stringify({ observations }) });
            const indicator = document.createElement('span');
            indicator.innerHTML = '✅ Sauvegardé';
            indicator.style.color = 'var(--success-green)'; indicator.style.fontSize = '12px';
            indicator.style.position = 'absolute'; indicator.style.right = '10px'; indicator.style.top = '10px';
            const container = document.getElementById('observations').parentElement;
            container.style.position = 'relative'; container.appendChild(indicator);
            setTimeout(() => indicator.remove(), 2000);
        } catch (e) { console.error('Erreur auto-save:', e); }
    }

    // ---------- Init+ ----------
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

// Fonctions globales (HTML onclick)
window.toggleTheme = () => window.app?.toggleTheme();
window.getCurrentLocation = (inputId) => window.app?.getCurrentLocation(inputId);
window.openQrScanner = () => window.app?.openQrScanner();
window.closeQrScanner = () => window.app?.closeQrScanner();
window.sendReportByEmail = () => {
    const email = prompt('Entrez votre adresse email:');
    if (email && window.app) window.app.showNotification('Rapport envoyé à ' + email, 'success');
};
window.adjustKeys = (change) => {
    if (!window.app) return;
    window.app.keyCount = Math.max(0, window.app.keyCount + change);
    const el = document.getElementById('keyCount');
    if (el) el.textContent = window.app.keyCount;
    window.app.checklistData.keyCount = window.app.keyCount;
    window.app.updateProgress();
};
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

// Rendu photos optionnelles
FiableAutoApp.prototype.renderOptionalPhotos = function () {
    const container = document.getElementById('optionalPhotos');
    if (!container) return;
    const photo = this.optionalPhotos[this.optionalPhotos.length - 1];
    const div = document.createElement('div');
    div.className = 'photo-card';
    div.dataset.photoId = photo.id;
    div.innerHTML = `
        <div class="photo-icon"><i class="fas fa-camera"></i></div>
        <h5>Photo libre ${this.optionalPhotos.length}</h5>
        <input type="file" accept="image/*" capture="environment" style="display: none;" id="optional-photo-${photo.id}">
        <button type="button" class="photo-btn" onclick="document.getElementById('optional-photo-${photo.id}').click()"><i class="fas fa-camera"></i> Prendre photo</button>
        <img class="photo-preview" style="display: none;">
        <button type="button" class="btn-enhanced btn-secondary" onclick="removeOptionalPhoto(this)" style="margin-top: 10px; padding: 5px 10px;"><i class="fas fa-trash"></i></button>
    `;
    container.appendChild(div);
    this.updateOptionalPhotoCount();
    const input = document.getElementById(`optional-photo-${photo.id}`);
    input.addEventListener('change', (e) => this.handleOptionalPhotoUpload(e, photo.id));
};

FiableAutoApp.prototype.updateOptionalPhotoCount = function () {
    const span = document.querySelector('h5 span');
    if (span) span.textContent = `(${this.optionalPhotos.length}/14)`;
};

// Init app
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new FiableAutoApp();
    window.app = app;
    setTimeout(() => app.showNotification('🚗 FiableAuto Enhanced chargé!', 'success'), 800);
});

// Erreurs / Réseau / SW
window.addEventListener('error', (e) => { console.error('Erreur application:', e.error); app?.showNotification('Une erreur est survenue', 'error'); });
window.addEventListener('online', () => { app?.checkApiConnection(); app?.showNotification('Connexion rétablie ✅', 'success'); });
window.addEventListener('offline', () => app?.showNotification('Mode hors ligne 📵', 'warning'));
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'SYNC_COMPLETE' && app) app.showNotification('Données synchronisées ✅', 'success');
    });
}
