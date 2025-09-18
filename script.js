// ========== CONFIGURAÇÃO DA API ==========
const API_CONFIG = {
    baseURL: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:3000/api'
        : 'https://aemoz-backend.onrender.com/api', // URL CORRETO AQUI
    timeout: 10000
};
// ========== CLASSE PARA COMUNICAÇÃO COM API ==========
class ApiClient {
    constructor() {
        this.baseURL = API_CONFIG.baseURL;
        this.token = localStorage.getItem('admin_token');
        this.tokenExpiry = localStorage.getItem('token_expiry');
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        // Adicionar token para endpoints administrativos
        if (this.token && endpoint.includes('/admin')) {
            config.headers.Authorization = `Bearer ${this.token}`;
        }

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `Erro ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error('Erro na requisição:', error);
            
            // Se token expirado, limpar e redirecionar para login
            if (error.message.includes('Token') || error.message.includes('403')) {
                this.clearAuth();
                showScreen('login');
                showErrorMessage('Sessão expirada. Faça login novamente.');
                return null;
            }
            
            throw error;
        }
    }

    setAuth(token) {
        this.token = token;
        const expiryTime = Date.now() + (8 * 60 * 60 * 1000); // 8 horas
        localStorage.setItem('admin_token', token);
        localStorage.setItem('token_expiry', expiryTime.toString());
        this.tokenExpiry = expiryTime.toString();
    }

    clearAuth() {
        this.token = null;
        this.tokenExpiry = null;
        localStorage.removeItem('admin_token');
        localStorage.removeItem('token_expiry');
    }

    isAuthenticated() {
        if (!this.token || !this.tokenExpiry) return false;
        return Date.now() < parseInt(this.tokenExpiry);
    }
}

// ========== VARIÁVEIS GLOBAIS ==========
let participants = [];
let finalGroups = [];
let isAdmin = false;
let api = new ApiClient();

// ========== FUNÇÕES DE DADOS ==========
async function loadData() {
    try {
        showLoadingMessage('Carregando dados...');
        const stats = await api.request('/stats');
        
        if (stats) {
            updateStatsFromAPI(stats);
        }
        
        hideLoadingMessage();
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        hideLoadingMessage();
        showErrorMessage('Erro ao carregar dados do servidor');
    }
}

async function loadAdminData() {
    if (!api.isAuthenticated()) {
        showScreen('login');
        return;
    }

    try {
        showLoadingMessage('Carregando dados administrativos...');
        
        // Carregar estatísticas gerais (que já conta cursos corretamente)
        const stats = await api.request('/stats');
        
        // Carregar participantes por curso
        const participantsByCourse = await api.request('/admin/participants/by-course');
        
        // Carregar resultado do sorteio se existir
        try {
            const sorteioResult = await api.request('/admin/sorteio/result');
            if (sorteioResult) {
                finalGroups = sorteioResult.grupos || [];
            }
        } catch (error) {
            // Ignorar erro se não há sorteio
            finalGroups = [];
        }
        
        // Processar dados
        participants = [];
        if (participantsByCourse) {
            participantsByCourse.forEach(course => {
                if (course.participants) {
                    participants.push(...course.participants);
                }
            });
        }

        // Atualizar estatísticas usando dados corretos do backend
        updateAdminStatsWithCorrectData(stats, participantsByCourse);
        hideLoadingMessage();
        
    } catch (error) {
        console.error('Erro ao carregar dados administrativos:', error);
        hideLoadingMessage();
        showErrorMessage('Erro ao carregar dados administrativos');
    }
}

function updateStatsFromAPI(stats) {
    document.getElementById('total-participants').textContent = stats.participants + ' Participantes';
    document.getElementById('total-courses').textContent = stats.courses + ' Cursos';
}

// ========== NAVEGAÇÃO ==========
function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.add('hidden');
    });
    
    const targetScreen = document.getElementById(screenName + '-screen');
    if (targetScreen) {
        targetScreen.classList.remove('hidden');
    }
    
    // Carregar dados específicos para cada tela
    if (screenName === 'home') {
        loadData();
    } else if (screenName === 'admin' && isAdmin) {
        loadAdminData();
    } else if (screenName === 'participantes' && isAdmin) {
        showParticipantsList();
    }
}

// ========== CADASTRO ==========
async function cadastrarParticipante() {
    const nome = document.getElementById('nome').value.trim();
    const curso = document.getElementById('curso').value;
    const semestre = document.getElementById('semestre').value;

    if (!nome || !curso || !semestre) {
        showErrorMessage('Por favor, preencha todos os campos!');
        return;
    }

    if (nome.length < 3) {
        showErrorMessage('Nome deve ter pelo menos 3 caracteres!');
        return;
    }

    try {
        showLoadingMessage('Cadastrando participante...');
        
        const result = await api.request('/participants', {
            method: 'POST',
            body: JSON.stringify({ nome, curso, semestre })
        });

        if (result) {
            // Limpar formulário
            document.getElementById('nome').value = '';
            document.getElementById('curso').value = '';
            document.getElementById('semestre').value = '';
            
            hideLoadingMessage();
            showSuccessMessage('Cadastro realizado com sucesso!');
            loadData(); // Atualizar estatísticas
        }
        
    } catch (error) {
        hideLoadingMessage();
        
        if (error.message.includes('existe')) {
            showErrorMessage('Já existe um participante com esse nome neste curso!');
        } else {
            showErrorMessage('Erro ao cadastrar participante: ' + error.message);
        }
    }
}

// ========== LOGIN/LOGOUT ==========
async function fazerLogin() {
    const password = document.getElementById('admin-password').value;
    
    if (!password) {
        showErrorMessage('Por favor, digite a senha!');
        return;
    }

    try {
        showLoadingMessage('Verificando credenciais...');
        
        const result = await api.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ password })
        });

        if (result && result.token) {
            api.setAuth(result.token);
            isAdmin = true;
            document.getElementById('admin-password').value = '';
            
            hideLoadingMessage();
            showSuccessMessage('Login realizado com sucesso!');
            showScreen('admin');
        }
        
    } catch (error) {
        hideLoadingMessage();
        showErrorMessage('Senha incorreta!');
    }
}

function logout() {
    api.clearAuth();
    isAdmin = false;
    participants = [];
    finalGroups = [];
    showScreen('home');
    showSuccessMessage('Logout realizado com sucesso!');
}

// ========== ESTATÍSTICAS ==========
function organizarPorCurso() {
    const porCurso = {};
    participants.forEach(p => {
        if (!porCurso[p.curso]) porCurso[p.curso] = [];
        porCurso[p.curso].push(p);
    });
    return porCurso;
}

function updateAdminStats() {
    const porCurso = organizarPorCurso();
    const totalParticipants = participants.length;
    const totalCourses = Object.keys(porCurso).length;
    
    document.getElementById('admin-participants').textContent = totalParticipants;
    document.getElementById('admin-courses').textContent = totalCourses;
    document.getElementById('admin-groups').textContent = finalGroups.length;
    
    // Atualizar resumo por curso
    const courseSummary = document.getElementById('course-summary');
    courseSummary.innerHTML = '';
    
    if (totalParticipants === 0) {
        courseSummary.innerHTML = '<p style="color: #9ca3af; text-align: center;">Nenhum participante cadastrado</p>';
    } else {
        Object.entries(porCurso)
            .sort(([,a], [,b]) => b.length - a.length)
            .forEach(([curso, participantes]) => {
                const div = document.createElement('div');
                div.className = 'course-summary';
                div.innerHTML = `<strong>${curso}:</strong> ${participantes.length} participante${participantes.length !== 1 ? 's' : ''}`;
                courseSummary.appendChild(div);
            });
    }
    
    // Habilitar/desabilitar botões
    const btnPdfParticipants = document.getElementById('btn-pdf-participants');
    const btnSorteio = document.getElementById('btn-sorteio');
    const btnClearAll = document.getElementById('btn-clear-all');
    const btnPdfGroups = document.getElementById('btn-pdf-groups');
    
    if (btnPdfParticipants) btnPdfParticipants.disabled = totalParticipants === 0;
    if (btnSorteio) btnSorteio.disabled = totalParticipants < 16;
    if (btnClearAll) btnClearAll.disabled = totalParticipants === 0 && finalGroups.length === 0;
    
    if (btnPdfGroups && finalGroups.length > 0) {
        btnPdfGroups.classList.remove('hidden');
    }
}

// Nova função que usa dados corretos do backend
function updateAdminStatsWithCorrectData(stats, participantsByCourse) {
    // Usar estatísticas do backend que são sempre corretas
    const totalParticipants = stats ? stats.participants : participants.length;
    const totalCourses = stats ? stats.courses : (participantsByCourse ? participantsByCourse.length : 0);
    
    document.getElementById('admin-participants').textContent = totalParticipants;
    document.getElementById('admin-courses').textContent = totalCourses;
    document.getElementById('admin-groups').textContent = finalGroups.length;
    
    // Atualizar resumo por curso
    const courseSummary = document.getElementById('course-summary');
    courseSummary.innerHTML = '';
    
    if (totalParticipants === 0) {
        courseSummary.innerHTML = '<p style="color: #9ca3af; text-align: center;">Nenhum participante cadastrado</p>';
    } else if (participantsByCourse) {
        participantsByCourse
            .sort((a, b) => b.count - a.count)
            .forEach(course => {
                const div = document.createElement('div');
                div.className = 'course-summary';
                div.innerHTML = `<strong>${course.curso}:</strong> ${course.count} participante${course.count !== 1 ? 's' : ''}`;
                courseSummary.appendChild(div);
            });
    }
    
    // Habilitar/desabilitar botões
    const btnPdfParticipants = document.getElementById('btn-pdf-participants');
    const btnSorteio = document.getElementById('btn-sorteio');
    const btnClearAll = document.getElementById('btn-clear-all');
    const btnPdfGroups = document.getElementById('btn-pdf-groups');
    
    if (btnPdfParticipants) btnPdfParticipants.disabled = totalParticipants === 0;
    if (btnSorteio) btnSorteio.disabled = totalParticipants < 16;
    if (btnClearAll) btnClearAll.disabled = totalParticipants === 0 && finalGroups.length === 0;
    
    if (btnPdfGroups && finalGroups.length > 0) {
        btnPdfGroups.classList.remove('hidden');
    }
}

// ========== LISTA DE PARTICIPANTES ==========
async function showParticipantsList() {
    if (!api.isAuthenticated()) {
        showScreen('login');
        return;
    }

    try {
        showLoadingMessage('Carregando lista de participantes...');
        
        const data = await api.request('/admin/participants/by-course');
        const participantsList = document.getElementById('participants-list');
        participantsList.innerHTML = '';
        
        if (!data || data.length === 0) {
            participantsList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #9ca3af;">
                    <h3>Nenhum participante cadastrado</h3>
                    <p>Os participantes cadastrados aparecerão aqui</p>
                </div>
            `;
            hideLoadingMessage();
            return;
        }
        
        // Ordenar cursos por número de participantes (decrescente)
        data.sort((a, b) => b.count - a.count);
        
        data.forEach(course => {
            const courseGroup = document.createElement('div');
            courseGroup.className = 'course-group';
            
            const participantes = course.participants || [];
            participantes.sort((a, b) => a.nome.localeCompare(b.nome));
            
            courseGroup.innerHTML = `
                <h3>${course.curso} (${course.count})</h3>
                <div class="participants-table">
                    ${participantes.map(p => `
                        <div class="participant-row">
                            <div>
                                <div class="name">${p.nome}</div>
                                <div class="semester">${p.semestre}º sem</div>
                                <div class="date">ID: ${p.id.substring(0, 8)}</div>
                            </div>
                            <div class="actions">
                                <button onclick="excluirParticipante('${p.id}', '${p.nome.replace(/'/g, "\\'")}', '${course.curso}')" class="btn-delete">
                                    🗑️ Excluir
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
            
            participantsList.appendChild(courseGroup);
        });
        
        hideLoadingMessage();
        
    } catch (error) {
        hideLoadingMessage();
        showErrorMessage('Erro ao carregar lista de participantes');
        console.error('Erro:', error);
    }
}

// ========== EXCLUSÃO ==========
async function excluirParticipante(id, nome, curso) {
    showModal(
        'Confirmar Exclusão',
        `Tem certeza que deseja excluir o participante:\n\n"${nome}"\nCurso: ${curso}\n\nEsta ação não poderá ser desfeita.`,
        'Cancelar',
        'Excluir',
        async () => {
            try {
                showLoadingMessage('Excluindo participante...');
                
                await api.request(`/admin/participants/${id}`, {
                    method: 'DELETE'
                });
                
                hideLoadingMessage();
                showSuccessMessage('Participante excluído com sucesso!');
                
                // Recarregar dados administrativos completos
                await loadAdminData();
                
                // Recarregar lista de participantes se estivermos na tela de participantes
                const currentScreen = document.querySelector('.screen:not(.hidden)');
                if (currentScreen && currentScreen.id === 'participantes-screen') {
                    await showParticipantsList();
                }
                
                // Atualizar estatísticas públicas
                await loadData();
                
            } catch (error) {
                hideLoadingMessage();
                showErrorMessage('Erro ao excluir participante: ' + error.message);
            }
        }
    );
}

async function limparTodosDados() {
    showModal(
        '⚠️ LIMPAR TODOS OS DADOS',
        `ATENÇÃO: Esta ação irá remover:\n\n• Todos os participantes cadastrados\n• Todos os grupos formados\n\nEsta ação é IRREVERSÍVEL!\n\nDeseja realmente continuar?`,
        'Cancelar',
        'Sim, Limpar Tudo',
        async () => {
            try {
                showLoadingMessage('Limpando todos os dados...');
                
                await api.request('/admin/clear-all', {
                    method: 'DELETE'
                });
                
                participants = [];
                finalGroups = [];
                
                hideLoadingMessage();
                showSuccessMessage('Todos os dados foram removidos!');
                
                // Recarregar dados administrativos
                await loadAdminData();
                
                // Atualizar estatísticas públicas
                await loadData();
                
            } catch (error) {
                hideLoadingMessage();
                showErrorMessage('Erro ao limpar dados: ' + error.message);
            }
        }
    );
}

// ========== DADOS DE TESTE ==========
async function addTestData() {
    if (!api.isAuthenticated()) {
        showScreen('login');
        return;
    }

    try {
        showLoadingMessage('Adicionando dados de teste...');
        
        const result = await api.request('/admin/test-data', {
            method: 'POST'
        });
        
        if (result) {
            hideLoadingMessage();
            showSuccessMessage(`${result.added} participantes de teste adicionados!`);
            
            // Recarregar dados administrativos
            await loadAdminData();
            
            // Atualizar estatísticas públicas
            await loadData();
        }
        
    } catch (error) {
        hideLoadingMessage();
        showErrorMessage('Erro ao adicionar dados de teste: ' + error.message);
    }
}

// ========== SORTEIO ==========
async function iniciarSorteio() {
    if (!api.isAuthenticated()) {
        showScreen('login');
        return;
    }

    try {
        showScreen('sorteio');
        
        // Reset da animação
        document.querySelectorAll('.step').forEach(step => step.classList.remove('active'));
        document.getElementById('sorting-animation').classList.remove('hidden');
        document.getElementById('results-container').classList.add('hidden');

        // Simular passos da animação
        await sleep(1000);
        document.getElementById('step1').classList.add('active');

        await sleep(2000);
        document.getElementById('step2').classList.add('active');
        
        await sleep(2000);
        document.getElementById('step3').classList.add('active');

        // Realizar sorteio no backend
        const result = await api.request('/admin/sorteio', {
            method: 'POST'
        });

        if (result && result.grupos) {
            await sleep(1000);
            document.getElementById('step4').classList.add('active');
            
            await sleep(1000);
            
            // Esconder animação e mostrar resultados
            document.getElementById('sorting-animation').classList.add('hidden');
            document.getElementById('results-container').classList.remove('hidden');
            
            // Exibir grupos
            displayGroups(result.grupos);
            finalGroups = result.grupos;
            
            // Recarregar dados administrativos para atualizar estatísticas
            await loadAdminData();
        }
        
    } catch (error) {
        showErrorMessage('Erro ao realizar sorteio: ' + error.message);
        showScreen('admin');
    }
}

function displayGroups(grupos) {
    const groupsGrid = document.getElementById('groups-grid');
    const subtitle = document.getElementById('results-subtitle');
    
    groupsGrid.innerHTML = '';
    subtitle.textContent = `${grupos.length} grupos formados com ${grupos.length * 4} participantes`;

    grupos.forEach(grupo => {
        const groupCard = document.createElement('div');
        groupCard.className = 'group-card';
        
        groupCard.innerHTML = `
            <div class="group-header" style="background: linear-gradient(135deg, ${grupo.cor}, ${adjustColor(grupo.cor, -20)})">
                <h3>${grupo.nome}</h3>
            </div>
            <div class="group-members">
                ${grupo.membros.map(membro => `
                    <div class="member">
                        <strong>${membro.nome}</strong>
                        <span>${membro.curso} - ${membro.semestre}º semestre</span>
                    </div>
                `).join('')}
            </div>
        `;
        
        groupsGrid.appendChild(groupCard);
    });
}

// ========== UTILITÁRIOS ==========
function adjustColor(color, amount) {
    const usePound = color[0] === '#';
    const col = usePound ? color.slice(1) : color;
    const num = parseInt(col, 16);
    let r = (num >> 16) + amount;
    let g = (num >> 8 & 0x00FF) + amount;
    let b = (num & 0x0000FF) + amount;
    r = r > 255 ? 255 : r < 0 ? 0 : r;
    g = g > 255 ? 255 : g < 0 ? 0 : g;
    b = b > 255 ? 255 : b < 0 ? 0 : b;
    return (usePound ? '#' : '') + (r << 16 | g << 8 | b).toString(16);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ========== MENSAGENS E MODAIS ==========
function showLoadingMessage(message) {
    hideAllMessages();
    const loading = document.createElement('div');
    loading.id = 'loading-message';
    loading.className = 'loading-message';
    loading.innerHTML = `
        <div class="spinner"></div>
        <span>${message}</span>
    `;
    document.body.appendChild(loading);
    
    // Adicionar estilo se não existir
    if (!document.getElementById('loading-styles')) {
        const style = document.createElement('style');
        style.id = 'loading-styles';
        style.textContent = `
            .loading-message {
                position: fixed;
                top: 20px;
                right: 20px;
                background: linear-gradient(135deg, #3b82f6, #2563eb);
                color: white;
                padding: 15px 25px;
                border-radius: 10px;
                box-shadow: 0 10px 25px rgba(59, 130, 246, 0.3);
                z-index: 1000;
                display: flex;
                align-items: center;
                gap: 10px;
                animation: slideIn 0.5s ease-out;
            }
            .spinner {
                width: 16px;
                height: 16px;
                border: 2px solid rgba(255,255,255,0.3);
                border-radius: 50%;
                border-top-color: white;
                animation: spin 1s ease-in-out infinite;
            }
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }
}

function hideLoadingMessage() {
    const loading = document.getElementById('loading-message');
    if (loading) {
        loading.remove();
    }
}

function showSuccessMessage(message) {
    hideAllMessages();
    const success = document.createElement('div');
    success.className = 'success-message';
    success.textContent = message;
    document.body.appendChild(success);
    
    setTimeout(() => success.remove(), 4000);
}

function showErrorMessage(message) {
    hideAllMessages();
    const error = document.createElement('div');
    error.className = 'error-message';
    error.textContent = message;
    error.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #ef4444, #dc2626);
        color: white;
        padding: 15px 25px;
        border-radius: 10px;
        box-shadow: 0 10px 25px rgba(239, 68, 68, 0.3);
        z-index: 1000;
        animation: slideIn 0.5s ease-out;
    `;
    document.body.appendChild(error);
    
    setTimeout(() => error.remove(), 6000);
}

function hideAllMessages() {
    ['loading-message', 'success-message', 'error-message'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });
    document.querySelectorAll('.error-message').forEach(el => el.remove());
}

function showModal(title, message, cancelText, confirmText, onConfirm) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>${title}</h3>
            <p style="white-space: pre-line;">${message}</p>
            <div class="modal-actions">
                <button class="btn btn-back" onclick="this.closest('.modal').remove()">${cancelText}</button>
                <button class="btn btn-danger" onclick="this.closest('.modal').remove(); (${onConfirm.toString()})()">${confirmText}</button>
            </div>
        </div>
    `;
    
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
    
    document.body.appendChild(modal);
}

// ========== GERAÇÃO DE PDF ==========
async function gerarPDF(tipo) {
    if (!api.isAuthenticated()) {
        showScreen('login');
        return;
    }

    try {
        showLoadingMessage(`Gerando PDF ${tipo === 'participantes' ? 'da lista de participantes' : 'dos resultados do sorteio'}...`);
        
        const endpoint = tipo === 'participantes' ? '/admin/pdf/participants' : '/admin/pdf/groups';
        const filename = tipo === 'participantes' ? 'lista-participantes.pdf' : 'resultado-sorteio.pdf';
        
        // Fazer requisição para o endpoint de PDF
        const response = await fetch(`${api.baseURL}${endpoint}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${api.token}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Erro ${response.status}`);
        }

        // Converter resposta para blob
        const blob = await response.blob();
        
        // Criar URL temporária para download
        const url = window.URL.createObjectURL(blob);
        
        // Criar elemento de download
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        
        // Adicionar ao DOM, clicar e remover
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // Limpar URL temporária
        window.URL.revokeObjectURL(url);
        
        hideLoadingMessage();
        showSuccessMessage(`PDF ${tipo === 'participantes' ? 'da lista de participantes' : 'dos resultados'} baixado com sucesso!`);
        
    } catch (error) {
        hideLoadingMessage();
        console.error('Erro ao gerar PDF:', error);
        
        if (error.message.includes('Nenhum')) {
            showErrorMessage(error.message);
        } else {
            showErrorMessage(`Erro ao gerar PDF: ${error.message}`);
        }
    }
}

// ========== INICIALIZAÇÃO ==========
document.addEventListener('DOMContentLoaded', async () => {
    // Verificar autenticação existente
    if (api.isAuthenticated()) {
        try {
            const validation = await api.request('/auth/validate');
            if (validation && validation.valid) {
                isAdmin = true;
            } else {
                api.clearAuth();
            }
        } catch (error) {
            api.clearAuth();
        }
    }
    
    // Carregar dados iniciais
    loadData();
    
    // Auto-refresh das estatísticas a cada 30 segundos
    setInterval(loadData, 30000);
});

// ========== EVENT LISTENERS ==========
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const activeElement = document.activeElement;
        
        if (activeElement && activeElement.id === 'admin-password') {
            fazerLogin();
        } else if (activeElement && (activeElement.id === 'nome' || activeElement.id === 'curso' || activeElement.id === 'semestre')) {
            cadastrarParticipante();
        }
    }
});

// Monitorar conexão com a internet
window.addEventListener('online', () => {
    showSuccessMessage('Conexão restaurada');
    loadData();
});

window.addEventListener('offline', () => {
    showErrorMessage('Conexão perdida. Algumas funcionalidades podem não funcionar.');
});