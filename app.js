// --- State Management ---
let state = {
    accessToken: '',
    adAccountId: '',
    datePreset: 'this_month',
    customStartDate: '',
    customEndDate: '',
    geminiKey: '',
    campaigns: [],
    filteredCampaigns: [],
    ads: [],
    filteredAds: [],
    dailyInsights: [],
    loading: false,
    accountInfo: null
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    loadConfigFromStorage();
    initializeLucide();
    setupEventListeners();
});

function initializeLucide() {
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// Load configurations from localStorage
function loadConfigFromStorage() {
    state.accessToken = localStorage.getItem('meta_access_token') || '';
    state.adAccountId = localStorage.getItem('meta_ad_account_id') || '';
    state.geminiKey = localStorage.getItem('gemini_api_key') || '';
    state.datePreset = localStorage.getItem('meta_date_preset') || 'this_month';
    state.customStartDate = localStorage.getItem('meta_custom_start_date') || '';
    state.customEndDate = localStorage.getItem('meta_custom_end_date') || '';

    document.getElementById('meta-token').value = state.accessToken;
    document.getElementById('ad-account-id').value = state.adAccountId;
    document.getElementById('gemini-key').value = state.geminiKey;
    document.getElementById('date-preset').value = state.datePreset;
    document.getElementById('custom-start-date').value = state.customStartDate;
    document.getElementById('custom-end-date').value = state.customEndDate;

    toggleCustomDateFields();
    updateChatModeBadge();
}

// Save configurations to localStorage
function saveConfigToStorage() {
    state.accessToken = document.getElementById('meta-token').value.trim();
    let accountId = document.getElementById('ad-account-id').value.trim();
    
    // Auto prefix act_ if missing
    if (accountId && !accountId.startsWith('act_') && !isNaN(accountId)) {
        accountId = 'act_' + accountId;
    }
    state.adAccountId = accountId;
    document.getElementById('ad-account-id').value = accountId;

    state.geminiKey = document.getElementById('gemini-key').value.trim();
    state.datePreset = document.getElementById('date-preset').value;
    state.customStartDate = document.getElementById('custom-start-date').value;
    state.customEndDate = document.getElementById('custom-end-date').value;

    localStorage.setItem('meta_access_token', state.accessToken);
    localStorage.setItem('meta_ad_account_id', state.adAccountId);
    localStorage.setItem('gemini_api_key', state.geminiKey);
    localStorage.setItem('meta_date_preset', state.datePreset);
    localStorage.setItem('meta_custom_start_date', state.customStartDate);
    localStorage.setItem('meta_custom_end_date', state.customEndDate);

    updateChatModeBadge();
}

function updateChatModeBadge() {
    const badge = document.getElementById('chat-mode-badge');
    if (state.geminiKey) {
        badge.innerText = 'Gemini AI Ativado';
        badge.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
        badge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        badge.style.color = 'var(--success)';
    } else {
        badge.innerText = 'Heurístico Local';
        badge.style.backgroundColor = 'rgba(139, 92, 246, 0.15)';
        badge.style.borderColor = 'rgba(139, 92, 246, 0.2)';
        badge.style.color = 'var(--primary-light)';
    }
}

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(`${inputId}-eye`);
    if (input.type === 'password') {
        input.type = 'text';
        icon.setAttribute('data-lucide', 'eye-off');
    } else {
        input.type = 'password';
        icon.setAttribute('data-lucide', 'eye');
    }
    initializeLucide();
}

// --- Setup Event Listeners ---
function setupEventListeners() {
    document.getElementById('btn-fetch').addEventListener('click', fetchData);
    document.getElementById('filter-active-only').addEventListener('change', filterAndRender);
    document.getElementById('btn-pdf').addEventListener('click', generatePDF);
    document.getElementById('date-preset').addEventListener('change', toggleCustomDateFields);
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submitChatMessage();
        }
    });

    // Listen to tab clicks
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            switchTab(tabId);
        });
    });
}

function switchTab(tabId) {
    // Update active state on buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.getAttribute('data-tab') === tabId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update active state on contents
    document.querySelectorAll('.tab-content').forEach(content => {
        if (content.id === `tab-content-${tabId}`) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
}

function toggleCustomDateFields() {
    const preset = document.getElementById('date-preset').value;
    const container = document.getElementById('custom-date-container');
    if (preset === 'custom') {
        container.style.display = 'flex';
    } else {
        container.style.display = 'none';
    }
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getMetaDateParams() {
    const preset = state.datePreset;
    const metaPresets = ['today', 'yesterday', 'this_month', 'last_month', 'last_30d', 'last_90d', 'maximum'];
    
    if (metaPresets.includes(preset)) {
        return {
            nested: `date_preset(${preset})`,
            query: `date_preset=${preset}`
        };
    }
    
    let since = '';
    let until = '';
    
    if (preset === 'last_3_months') {
        const today = new Date();
        until = formatDate(today);
        const sinceDate = new Date();
        sinceDate.setMonth(today.getMonth() - 3);
        since = formatDate(sinceDate);
    } else if (preset === 'custom') {
        since = state.customStartDate;
        until = state.customEndDate;
    }
    
    const timeRangeStr = JSON.stringify({ since, until });
    return {
        nested: `time_range({"since":"${since}","until":"${until}"})`,
        query: `time_range=${encodeURIComponent(timeRangeStr)}`
    };
}

// --- Fetch Data from Meta Ads API ---
async function fetchData() {
    saveConfigToStorage();

    if (!state.accessToken || !state.adAccountId) {
        alert('Por favor, preencha o Access Token e o ID da Conta de Anúncios.');
        return;
    }

    if (state.datePreset === 'custom') {
        if (!state.customStartDate || !state.customEndDate) {
            alert('Por favor, preencha as datas inicial e final para o período personalizado.');
            return;
        }
    }

    const dateParams = getMetaDateParams();

    setLoadingState(true);
    updateApiStatus('connecting', 'Conectando...');

    try {
        // 0. Fetch Ad Account Details (Name, Status, Balance, Spend Cap, Currency, Funding Source)
        let accountData = null;
        try {
            const accountFields = 'name,account_status,balance,amount_spent,spend_cap,account_currency,funding_source_details';
            const accountUrl = `https://graph.facebook.com/v20.0/${state.adAccountId}?fields=${encodeURIComponent(accountFields)}&access_token=${encodeURIComponent(state.accessToken)}`;
            const accountResponse = await fetch(accountUrl);
            accountData = await accountResponse.json();
            
            if (accountData && accountData.error) {
                console.warn('Erro ao carregar dados da conta de anúncios:', accountData.error);
            }
        } catch (accError) {
            console.warn('Falha na requisição de dados da conta de anúncios:', accError);
        }

        if (accountData && !accountData.error) {
            state.accountInfo = {
                name: accountData.name,
                status: accountData.account_status,
                balance: parseFloat(accountData.balance || 0) / 100,
                amountSpent: parseFloat(accountData.amount_spent || 0) / 100,
                spendCap: accountData.spend_cap ? parseFloat(accountData.spend_cap) / 100 : 0,
                currency: accountData.account_currency || 'BRL',
                fundingSource: accountData.funding_source || 'Desconhecido',
                fundingSourceDetails: accountData.funding_source_details || null
            };
        } else {
            state.accountInfo = null;
        }

        // 1. Fetch campaigns and insights (lightweight request)
        const campaignFields = 'name,status,effective_status,daily_budget,lifetime_budget,objective,buying_type,insights.' + dateParams.nested + '{spend,actions,action_values,impressions,reach,clicks,inline_link_click_ctr}';
        const campaignUrl = `https://graph.facebook.com/v20.0/${state.adAccountId}/campaigns?fields=${encodeURIComponent(campaignFields)}&limit=100&access_token=${encodeURIComponent(state.accessToken)}`;

        const campaignResponse = await fetch(campaignUrl);
        const campaignData = await campaignResponse.json();

        if (campaignData.error) {
            throw new Error(campaignData.error.message || 'Erro ao carregar campanhas da API do Meta.');
        }

        // 2. Fetch ads and creatives separately with individual metrics (non-blocking request to prevent crashes if it fails)
        let adsData = [];
        try {
            const adsFields = 'campaign{id,name},name,status,creative{id,name,thumbnail_url,image_url,body,title},insights.' + dateParams.nested + '{spend,actions,action_values,clicks}';
            const adsUrl = `https://graph.facebook.com/v20.0/${state.adAccountId}/ads?fields=${encodeURIComponent(adsFields)}&limit=250&access_token=${encodeURIComponent(state.accessToken)}`;
            
            const adsResponse = await fetch(adsUrl);
            const adsJson = await adsResponse.json();
            
            if (adsJson && adsJson.data) {
                adsData = adsJson.data;
            }
        } catch (adError) {
            console.warn('Falha ao carregar prévias dos criativos:', adError);
            // Continua a execução para não quebrar o dashboard principal
        }

        // 2.1 Fetch daily insights for the account breakdown (non-blocking request)
        let dailyInsightsData = [];
        try {
            const dailyUrl = `https://graph.facebook.com/v20.0/${state.adAccountId}/insights?fields=spend,actions,action_values,clicks&time_increment=1&${dateParams.query}&limit=100&access_token=${encodeURIComponent(state.accessToken)}`;
            const dailyResponse = await fetch(dailyUrl);
            const dailyJson = await dailyResponse.json();
            if (dailyJson && dailyJson.data) {
                dailyInsightsData = dailyJson.data;
            }
        } catch (dailyError) {
            console.warn('Falha ao carregar insights diários:', dailyError);
        }

        // Map and parse daily insights
        state.dailyInsights = dailyInsightsData.map(day => {
            const spend = parseFloat(day.spend || 0);
            const clicks = parseInt(day.clicks || 0);
            
            let purchases = 0;
            let leads = 0;
            let whatsapp = 0;
            
            if (day.actions) {
                day.actions.forEach(act => {
                    const value = parseInt(act.value) || 0;
                    if (act.action_type === 'purchase') {
                        purchases = value;
                    } else if (act.action_type === 'lead' || act.action_type === 'submit_application' || act.action_type === 'leadgen.other') {
                        leads += value;
                    } else if (act.action_type === 'onsite_conversion.messaging_first_reply_started' || act.action_type === 'contact') {
                        whatsapp += value;
                    }
                });
            }

            return {
                date: day.date_start,
                spend: spend,
                clicks: clicks,
                purchases: purchases,
                leads: leads,
                whatsapp: whatsapp
            };
        }).sort((a, b) => new Date(a.date) - new Date(b.date));

        // Parse individual Ads performance data
        state.ads = adsData.map(ad => {
            const creative = ad.creative || {};
            const insights = ad.insights && ad.insights.data && ad.insights.data[0] ? ad.insights.data[0] : null;
            const spend = insights ? parseFloat(insights.spend || 0) : 0;
            
            let purchases = 0;
            let leads = 0;
            let whatsapp = 0;
            let linkClicks = insights ? parseInt(insights.clicks || 0) : 0;
            
            if (insights && insights.actions) {
                insights.actions.forEach(act => {
                    const value = parseInt(act.value) || 0;
                    if (act.action_type === 'purchase') {
                        purchases = value;
                    } else if (act.action_type === 'lead' || act.action_type === 'submit_application' || act.action_type === 'leadgen.other') {
                        leads += value;
                    } else if (act.action_type === 'onsite_conversion.messaging_first_reply_started' || act.action_type === 'contact') {
                        whatsapp += value;
                    } else if (act.action_type === 'link_click') {
                        linkClicks = value;
                    }
                });
            }

            let purchaseValue = 0;
            if (insights && insights.action_values) {
                insights.action_values.forEach(act => {
                    if (act.action_type === 'purchase') {
                        purchaseValue = parseFloat(act.value) || 0;
                    }
                });
            }

            const roas = spend > 0 ? (purchaseValue / spend) : 0;
            const cpc = linkClicks > 0 ? (spend / linkClicks) : 0;

            return {
                id: ad.id,
                name: ad.name,
                status: ad.status,
                campaignId: ad.campaign ? ad.campaign.id : '',
                campaignName: ad.campaign ? ad.campaign.name : '',
                creativeId: creative.id || '',
                creativeName: creative.name || '',
                thumbnailUrl: creative.thumbnail_url || '',
                imageUrl: creative.image_url || '',
                body: creative.body || '',
                title: creative.title || '',
                spend: spend,
                purchases: purchases,
                purchaseValue: purchaseValue,
                leads: leads,
                whatsapp: whatsapp,
                linkClicks: linkClicks,
                roas: roas,
                cpc: cpc
            };
        });

        // 3. Map and parse Meta API response by joining campaigns and ads in memory
        state.campaigns = (campaignData.data || []).map(campaign => {
            const insights = campaign.insights && campaign.insights.data && campaign.insights.data[0] ? campaign.insights.data[0] : null;
            const spend = insights ? parseFloat(insights.spend || 0) : 0;
            
            // Extract actions counts
            let purchases = 0;
            let leads = 0;
            let whatsapp = 0;
            let linkClicks = 0;

            if (insights && insights.actions) {
                insights.actions.forEach(act => {
                    const value = parseInt(act.value) || 0;
                    if (act.action_type === 'purchase') {
                        purchases = value;
                    } else if (act.action_type === 'lead' || act.action_type === 'submit_application' || act.action_type === 'leadgen.other') {
                        leads += value;
                    } else if (act.action_type === 'onsite_conversion.messaging_first_reply_started' || act.action_type === 'contact') {
                        whatsapp += value;
                    } else if (act.action_type === 'link_click') {
                        linkClicks = value;
                    }
                });
            }

            // Extract actions values (purchases value for ROAS)
            let purchaseValue = 0;
            if (insights && insights.action_values) {
                insights.action_values.forEach(act => {
                    if (act.action_type === 'purchase') {
                        purchaseValue = parseFloat(act.value) || 0;
                    }
                });
            }

            // ROAS Calculation
            const roas = spend > 0 ? (purchaseValue / spend) : 0;

            // Extract branding/traffic metrics
            const impressions = insights ? parseInt(insights.impressions || 0) : 0;
            const reach = insights ? parseInt(insights.reach || 0) : 0;
            const clicks = insights ? parseInt(insights.clicks || 0) : 0;
            const ctr = insights ? parseFloat(insights.inline_link_click_ctr || 0) : 0;

            // Detect Primary Result (WhatsApp, Leads, Purchases, Clicks)
            const resultData = parsePrimaryResult(campaign, purchases, leads, whatsapp, linkClicks);

            // Filter ads belonging to this campaign from state.ads
            const adsList = state.ads.filter(ad => ad.campaignId === campaign.id);

            return {
                id: campaign.id,
                name: campaign.name,
                status: campaign.status,
                effectiveStatus: campaign.effective_status,
                objective: campaign.objective,
                dailyBudget: campaign.daily_budget ? parseFloat(campaign.daily_budget) / 100 : null,
                lifetimeBudget: campaign.lifetime_budget ? parseFloat(campaign.lifetime_budget) / 100 : null,
                spend: spend,
                purchases: purchases,
                purchaseValue: purchaseValue,
                leads: leads,
                whatsapp: whatsapp,
                linkClicks: linkClicks,
                roas: roas,
                impressions: impressions,
                reach: reach,
                clicks: clicks,
                ctr: ctr,
                primaryResult: resultData,
                ads: adsList
            };
        });

        updateApiStatus('connected', 'Conectado');
        filterAndRender();

        // Enable Chatbot Input
        document.getElementById('chat-input').disabled = false;
        document.getElementById('btn-chat-send').disabled = false;

        // Add a welcoming message from the Bot
        addChatMessage('bot-message', `Sincronização concluída com sucesso! Carreguei ${state.campaigns.length} campanhas da conta de anúncios. Faça uma pergunta para começarmos a análise.`);

    } catch (error) {
        console.error('Fetch Error:', error);
        updateApiStatus('disconnected', 'Erro na Conexão');
        alert('Erro ao buscar dados: ' + error.message);
    } finally {
        setLoadingState(false);
    }
}

function updateApiStatus(status, text) {
    const badge = document.getElementById('api-status-badge');
    if (!badge) return;
    badge.className = `badge badge-${status === 'connected' ? 'connected' : (status === 'connecting' ? 'connected' : 'disconnected')}`;
    const textEl = badge.querySelector('.status-text');
    if (textEl) textEl.innerText = text;
}

function setLoadingState(loading) {
    state.loading = loading;
    const btn = document.getElementById('btn-fetch');
    if (!btn) return;
    const icon = btn.querySelector('i, svg');
    const text = btn.querySelector('span');

    if (loading) {
        btn.disabled = true;
        if (icon) {
            icon.classList.add('icon-spin-hover');
            icon.setAttribute('data-lucide', 'refresh-cw');
        }
        if (text) text.innerText = 'Sincronizando...';
    } else {
        btn.disabled = false;
        if (icon) {
            icon.classList.remove('icon-spin-hover');
        }
        if (text) text.innerText = 'Sincronizar Dados';
    }
    initializeLucide();
}

// --- Parse Primary Results dynamically based on Campaign Objective ---
function parsePrimaryResult(campaign, purchases, leads, whatsapp, linkClicks) {
    const objective = (campaign.objective || '').toUpperCase();
    const insights = campaign.insights && campaign.insights.data && campaign.insights.data[0] ? campaign.insights.data[0] : null;
    const spend = insights ? parseFloat(insights.spend || 0) : 0;

    // Detect objective types
    if (objective.includes('SALES') || objective.includes('CONVERSIONS')) {
        const cpa = purchases > 0 ? (spend / purchases) : 0;
        return {
            label: 'Compras',
            count: purchases,
            cost: cpa,
            displayText: `${purchases} Compras`,
            costText: purchases > 0 ? `CPA: R$ ${cpa.toFixed(2)}` : 'CPA: R$ 0,00'
        };
    } else if (objective.includes('LEADS')) {
        const cpl = leads > 0 ? (spend / leads) : 0;
        return {
            label: 'Leads',
            count: leads,
            cost: cpl,
            displayText: `${leads} Leads`,
            costText: leads > 0 ? `CPL: R$ ${cpl.toFixed(2)}` : 'CPL: R$ 0,00'
        };
    } else if (objective.includes('MESSAGING') || objective.includes('ENGAGEMENT')) {
        // WhatsApp or general engagement (usually conversations)
        const costPerConv = whatsapp > 0 ? (spend / whatsapp) : 0;
        return {
            label: 'Conversas',
            count: whatsapp,
            cost: costPerConv,
            displayText: `${whatsapp} Conversas`,
            costText: whatsapp > 0 ? `Custo/Conversa: R$ ${costPerConv.toFixed(2)}` : 'Custo/Conversa: R$ 0,00'
        };
    } else if (objective.includes('TRAFFIC')) {
        const cpc = linkClicks > 0 ? (spend / linkClicks) : 0;
        return {
            label: 'Cliques',
            count: linkClicks,
            cost: cpc,
            displayText: `${linkClicks} Cliques`,
            costText: linkClicks > 0 ? `CPC: R$ ${cpc.toFixed(2)}` : 'CPC: R$ 0,00'
        };
    }

    // Fallback: Smart heuristic detection based on metrics presence
    if (purchases > 0) {
        const cpa = spend / purchases;
        return { label: 'Compras', count: purchases, cost: cpa, displayText: `${purchases} Compras`, costText: `CPA: R$ ${cpa.toFixed(2)}` };
    } else if (leads > 0) {
        const cpl = spend / leads;
        return { label: 'Leads', count: leads, cost: cpl, displayText: `${leads} Leads`, costText: `CPL: R$ ${cpl.toFixed(2)}` };
    } else if (whatsapp > 0) {
        const costPerConv = spend / whatsapp;
        return { label: 'Conversas', count: whatsapp, cost: costPerConv, displayText: `${whatsapp} Conversas`, costText: `Custo/Conversa: R$ ${costPerConv.toFixed(2)}` };
    } else if (linkClicks > 0) {
        const cpc = spend / linkClicks;
        return { label: 'Cliques', count: linkClicks, cost: cpc, displayText: `${linkClicks} Cliques`, costText: `CPC: R$ ${cpc.toFixed(2)}` };
    }

    return { label: 'Cliques', count: 0, cost: 0, displayText: '0 Resultados', costText: '---' };
}

// --- Filter and Render Campaigns & KPIs ---
function filterAndRender() {
    const showActiveOnly = document.getElementById('filter-active-only').checked;
    
    // Apply filters
    state.filteredCampaigns = state.campaigns.filter(c => {
        if (showActiveOnly) {
            return c.effectiveStatus === 'ACTIVE' || c.status === 'ACTIVE';
        }
        return true;
    });

    renderKPIs();
    renderTable();
    filterAndRenderAds(); // Render creatives section
    renderBalance(); // Render account balance section
    
    // Enable PDF download if campaigns exist
    document.getElementById('btn-pdf').disabled = state.filteredCampaigns.length === 0;
}

// Compute and Render KPI Card values based on currently filtered campaigns
function renderKPIs() {
    let totalSpend = 0;
    let totalPurchases = 0;
    let totalPurchaseValue = 0;
    let totalLeads = 0;
    let totalWhatsapp = 0;

    state.filteredCampaigns.forEach(c => {
        totalSpend += c.spend;
        totalPurchases += c.purchases;
        totalPurchaseValue += c.purchaseValue;
        totalLeads += c.leads;
        totalWhatsapp += c.whatsapp;
    });

    // Formatting currency & values
    document.getElementById('kpi-total-spend').innerText = `R$ ${totalSpend.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    const countActive = state.filteredCampaigns.filter(c => c.effectiveStatus === 'ACTIVE' || c.status === 'ACTIVE').length;
    document.getElementById('kpi-spend-meta').innerText = `${countActive} Campanhas Ativas exibidas`;

    document.getElementById('kpi-total-purchases').innerText = totalPurchases.toLocaleString('pt-BR');
    document.getElementById('kpi-purchases-value').innerText = `Valor: R$ ${totalPurchaseValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    document.getElementById('kpi-total-leads').innerText = totalLeads.toLocaleString('pt-BR');
    const cpl = totalLeads > 0 ? (totalSpend / totalLeads) : 0;
    document.getElementById('kpi-leads-cost').innerText = `Custo Médio: R$ ${cpl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    document.getElementById('kpi-total-whatsapp').innerText = totalWhatsapp.toLocaleString('pt-BR');
    const cpw = totalWhatsapp > 0 ? (totalSpend / totalWhatsapp) : 0;
    document.getElementById('kpi-whatsapp-cost').innerText = `Custo Médio: R$ ${cpw.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Render Campaigns Table Body
function renderTable() {
    const tbody = document.getElementById('campaigns-table-body');
    const countLabel = document.getElementById('table-campaigns-count');
    
    tbody.innerHTML = '';
    
    if (state.filteredCampaigns.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="table-empty-state">
                    <div class="empty-state-content">
                        <i data-lucide="database"></i>
                        <p>Nenhuma campanha corresponde aos filtros selecionados.</p>
                    </div>
                </td>
            </tr>
        `;
        countLabel.innerText = 'Nenhuma campanha carregada';
        initializeLucide();
        return;
    }

    countLabel.innerText = `Mostrando ${state.filteredCampaigns.length} de ${state.campaigns.length} campanhas`;

    state.filteredCampaigns.forEach(c => {
        const row = document.createElement('tr');
        
        // Name and Creatives Thumbnail Display
        const tdName = document.createElement('td');
        tdName.innerHTML = `<div style="font-weight: 600; font-size: 0.92rem;">${c.name}</div>`;
        
        if (c.ads && c.ads.length > 0) {
            const creativesDiv = document.createElement('div');
            creativesDiv.className = 'campaign-creatives';
            
            c.ads.slice(0, 5).forEach(ad => {
                if (ad.thumbnailUrl) {
                    const img = document.createElement('img');
                    img.className = 'creative-thumb';
                    img.src = ad.thumbnailUrl;
                    img.title = ad.name;
                    img.alt = ad.name;
                    img.addEventListener('click', () => openCreativeModal(c.id, ad.id));
                    creativesDiv.appendChild(img);
                } else {
                    const placeholder = document.createElement('div');
                    placeholder.className = 'creative-thumb-placeholder';
                    placeholder.title = `${ad.name} (Sem Prévia)`;
                    placeholder.innerHTML = `<i data-lucide="image"></i>`;
                    placeholder.addEventListener('click', () => openCreativeModal(c.id, ad.id));
                    creativesDiv.appendChild(placeholder);
                }
            });

            if (c.ads.length > 5) {
                const countIndicator = document.createElement('span');
                countIndicator.style.fontSize = '0.72rem';
                countIndicator.style.color = 'var(--text-muted)';
                countIndicator.style.marginLeft = '4px';
                countIndicator.innerText = `+${c.ads.length - 5}`;
                creativesDiv.appendChild(countIndicator);
            }
            
            tdName.appendChild(creativesDiv);
        }
        
        // Status Badge
        const tdStatus = document.createElement('td');
        const isActive = c.effectiveStatus === 'ACTIVE' || c.status === 'ACTIVE';
        tdStatus.innerHTML = `
            <span class="status-pill ${isActive ? 'status-active' : 'status-paused'}">
                <span class="status-dot"></span>
                <span>${c.effectiveStatus || c.status}</span>
            </span>
        `;
        
        // Budget
        const tdBudget = document.createElement('td');
        if (c.dailyBudget) {
            tdBudget.innerText = `R$ ${c.dailyBudget.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/dia`;
        } else if (c.lifetimeBudget) {
            tdBudget.innerText = `R$ ${c.lifetimeBudget.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (Vitalício)`;
        } else {
            tdBudget.innerHTML = `<span style="color: var(--text-muted);">Conjunto/N/A</span>`;
        }

        // Primary Results (Dynamic text & Cost per result)
        const tdResults = document.createElement('td');
        tdResults.innerHTML = `
            <div style="font-weight: 600;">${c.primaryResult.displayText}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">${c.primaryResult.costText}</div>
        `;

        // Purchases (ecommerce metric)
        const tdPurchases = document.createElement('td');
        tdPurchases.innerHTML = `
            <div>${c.purchases} Compras</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">R$ ${c.purchaseValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        `;

        // ROAS or CPA Column
        const tdRoas = document.createElement('td');
        if (c.roas > 0) {
            tdRoas.innerHTML = `
                <div style="color: var(--color-purchases); font-weight: 700;">ROAS: ${c.roas.toFixed(2)}x</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">Invest: R$ ${c.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            `;
        } else {
            // Display Cost per primary result if no ROAS is present
            const cost = c.primaryResult.cost;
            tdRoas.innerHTML = `
                <div style="font-weight: 600;">${cost > 0 ? `CPA: R$ ${cost.toFixed(2)}` : 'CPA: R$ 0,00'}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">Invest: R$ ${c.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            `;
        }

        row.appendChild(tdName);
        row.appendChild(tdStatus);
        row.appendChild(tdBudget);
        row.appendChild(tdResults);
        row.appendChild(tdPurchases);
        row.appendChild(tdRoas);
        tbody.appendChild(row);
    });

    initializeLucide();
}

// --- PDF Generation and Downloader ---
function generatePDF() {
    try {
        const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : (window.jsPDF ? window.jsPDF : null);
        
        if (!jsPDFClass) {
            throw new Error("A biblioteca jsPDF não foi encontrada. Verifique se o script foi bloqueado ou se há conexão com a internet.");
        }

        const doc = new jsPDFClass('p', 'mm', 'a4');

        if (typeof doc.autoTable !== 'function') {
            throw new Error("O plugin autoTable (para gerar tabelas no PDF) não foi carregado corretamente.");
        }

        const width = doc.internal.pageSize.getWidth();
        const height = doc.internal.pageSize.getHeight();
        const reportType = document.getElementById('pdf-report-type').value;

        // Custom titles based on selection
        let reportTitle = 'Relatório Executivo de Campanhas';
        if (reportType === 'sales') reportTitle = 'Relatório de Vendas e E-commerce';
        else if (reportType === 'leads') reportTitle = 'Relatório de Geração de Leads';
        else if (reportType === 'whatsapp') reportTitle = 'Relatório de WhatsApp e Contatos';
        else if (reportType === 'branding') reportTitle = 'Relatório de Branding, Tráfego e Alcance';

        // Brand header banner (violet-purple color)
        doc.setFillColor(22, 28, 45); // Dark Slate Blue
        doc.rect(0, 0, width, 40, 'F');

        // Header Title
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.text(reportTitle, 14, 18);
        
        // Header Subtitle
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(200, 200, 220);
        
        let periodLabel = state.datePreset.toUpperCase();
        if (state.datePreset === 'custom') {
            periodLabel = `PERSONALIZADO (${state.customStartDate.split('-').reverse().join('/')} A ${state.customEndDate.split('-').reverse().join('/')})`;
        } else if (state.datePreset === 'last_3_months') {
            periodLabel = 'ÚLTIMOS 3 MESES';
        } else if (state.datePreset === 'last_month') {
            periodLabel = 'MÊS PASSADO';
        } else if (state.datePreset === 'this_month') {
            periodLabel = 'ESTE MÊS';
        } else if (state.datePreset === 'last_30d') {
            periodLabel = 'ÚLTIMOS 30 DIAS';
        } else if (state.datePreset === 'last_90d') {
            periodLabel = 'ÚLTIMOS 90 DIAS';
        } else if (state.datePreset === 'today') {
            periodLabel = 'HOJE';
        } else if (state.datePreset === 'yesterday') {
            periodLabel = 'ONTEM';
        } else if (state.datePreset === 'maximum') {
            periodLabel = 'TODO O PERÍODO';
        }

        doc.text(`Conta de Anúncios: ${state.adAccountId} | Período: ${periodLabel}`, 14, 25);
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, 14, 30);

        // Calc Summary metrics
        let totalSpend = 0;
        let totalPurchases = 0;
        let totalPurchaseValue = 0;
        let totalLeads = 0;
        let totalWhatsapp = 0;
        let totalImpressions = 0;
        let totalClicks = 0;
        let totalReach = 0;
        
        state.filteredCampaigns.forEach(c => {
            totalSpend += c.spend;
            totalPurchases += c.purchases;
            totalPurchaseValue += c.purchaseValue;
            totalLeads += c.leads;
            totalWhatsapp += c.whatsapp;
            totalImpressions += c.impressions || 0;
            totalClicks += c.clicks || 0;
            totalReach += c.reach || 0;
        });

        // Summary Section Box
        doc.setFillColor(245, 247, 250); // Light light grey
        doc.rect(14, 48, width - 28, 30, 'F');
        doc.setDrawColor(220, 225, 230);
        doc.rect(14, 48, width - 28, 30, 'D');

        doc.setTextColor(50, 50, 50);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('RESUMO CONSOLIDADO DA CONTA', 18, 54);

        doc.setFont('helvetica', 'normal');
        
        // Layout dynamic KPIs in the summary box based on reportType
        if (reportType === 'sales') {
            doc.text(`Total Investido: R$ ${totalSpend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 18, 62);
            doc.text(`Total Compras: ${totalPurchases} conversões`, 18, 68);
            doc.text(`CPA Médio: R$ ${(totalPurchases > 0 ? totalSpend / totalPurchases : 0).toFixed(2)}`, 18, 74);
            
            doc.text(`Faturamento: R$ ${totalPurchaseValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 105, 62);
            doc.text(`ROAS Médio: ${totalSpend > 0 ? (totalPurchaseValue / totalSpend).toFixed(2) : 0}x`, 105, 68);
            doc.text(`Campanhas Exibidas: ${state.filteredCampaigns.length}`, 105, 74);
        } 
        else if (reportType === 'leads') {
            doc.text(`Total Investido: R$ ${totalSpend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 18, 62);
            doc.text(`Total Leads Gerados: ${totalLeads} contatos`, 18, 68);
            doc.text(`CPL Médio: R$ ${(totalLeads > 0 ? totalSpend / totalLeads : 0).toFixed(2)}`, 18, 74);
            
            doc.text(`Conversões de Cadastro: ${totalLeads}`, 105, 62);
            doc.text(`Campanhas Exibidas: ${state.filteredCampaigns.length}`, 105, 68);
        }
        else if (reportType === 'whatsapp') {
            doc.text(`Total Investido: R$ ${totalSpend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 18, 62);
            doc.text(`Conversas WhatsApp: ${totalWhatsapp} contatos`, 18, 68);
            doc.text(`Custo por Conversa: R$ ${(totalWhatsapp > 0 ? totalSpend / totalWhatsapp : 0).toFixed(2)}`, 18, 74);
            
            doc.text(`Cliques no Link (Whats): ${totalClicks || totalWhatsapp}`, 105, 62);
            doc.text(`Campanhas Exibidas: ${state.filteredCampaigns.length}`, 105, 68);
        }
        else if (reportType === 'branding') {
            const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
            const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
            const avgCpm = totalImpressions > 0 ? (totalSpend / (totalImpressions / 1000)) : 0;

            doc.text(`Total Investido: R$ ${totalSpend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 18, 62);
            doc.text(`Total Impressões: ${totalImpressions.toLocaleString('pt-BR')}`, 18, 68);
            doc.text(`Alcance Estimado (Reach): ${totalReach.toLocaleString('pt-BR')}`, 18, 74);
            
            doc.text(`Cliques no Link: ${totalClicks.toLocaleString('pt-BR')}`, 105, 62);
            doc.text(`CTR Médio: ${avgCtr.toFixed(2)}% | CPC Médio: R$ ${avgCpc.toFixed(2)}`, 105, 68);
            doc.text(`CPM Médio: R$ ${avgCpm.toFixed(2)}`, 105, 74);
        }
        else { // 'all'
            doc.text(`Total Investido: R$ ${totalSpend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 18, 62);
            doc.text(`Total Compras: ${totalPurchases} (Valor: R$ ${totalPurchaseValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`, 18, 68);
            doc.text(`ROAS Médio da Conta: ${totalSpend > 0 ? (totalPurchaseValue / totalSpend).toFixed(2) : 0}x`, 18, 74);

            doc.text(`Total Leads Gerados: ${totalLeads} (CPL Médio: R$ ${(totalLeads > 0 ? totalSpend / totalLeads : 0).toFixed(2)})`, 105, 62);
            doc.text(`Conversas no WhatsApp: ${totalWhatsapp} (Custo/Conversa: R$ ${(totalWhatsapp > 0 ? totalSpend / totalWhatsapp : 0).toFixed(2)})`, 105, 68);
            doc.text(`Campanhas Exibidas: ${state.filteredCampaigns.length}`, 105, 74);
        }

        // Dynamically build headers and rows for tables
        let tableHeaders = [];
        let tableRows = [];
        let colWidths = {};

        if (reportType === 'sales') {
            tableHeaders = [['Campanha', 'Status', 'Orçamento', 'Compras', 'Faturamento', 'CPA', 'ROAS', 'Investido']];
            tableRows = state.filteredCampaigns.map(c => {
                let budgetStr = 'Conjunto/N/A';
                if (c.dailyBudget) budgetStr = `R$ ${c.dailyBudget.toFixed(2)}/dia`;
                else if (c.lifetimeBudget) budgetStr = `R$ ${c.lifetimeBudget.toFixed(2)} (Vit.)`;

                const cpa = c.purchases > 0 ? c.spend / c.purchases : 0;

                return [
                    c.name,
                    c.effectiveStatus || c.status,
                    budgetStr,
                    `${c.purchases} Compras`,
                    `R$ ${c.purchaseValue.toFixed(2)}`,
                    `R$ ${cpa.toFixed(2)}`,
                    `${c.roas.toFixed(2)}x`,
                    `R$ ${c.spend.toFixed(2)}`
                ];
            });
            colWidths = {
                0: { cellWidth: 50 }, // Campaign Name
                1: { cellWidth: 15 }, // Status
                2: { cellWidth: 22 }, // Budget
                3: { cellWidth: 20 }, // Compras
                4: { cellWidth: 22 }, // Faturamento
                5: { cellWidth: 18 }, // CPA
                6: { cellWidth: 15 }, // ROAS
                7: { cellWidth: 20 }  // Investido
            };
        } 
        else if (reportType === 'leads') {
            tableHeaders = [['Campanha', 'Status', 'Orçamento', 'Leads', 'CPL', 'Investido']];
            tableRows = state.filteredCampaigns.map(c => {
                let budgetStr = 'Conjunto/N/A';
                if (c.dailyBudget) budgetStr = `R$ ${c.dailyBudget.toFixed(2)}/dia`;
                else if (c.lifetimeBudget) budgetStr = `R$ ${c.lifetimeBudget.toFixed(2)} (Vit.)`;

                const cpl = c.leads > 0 ? c.spend / c.leads : 0;

                return [
                    c.name,
                    c.effectiveStatus || c.status,
                    budgetStr,
                    `${c.leads} Leads`,
                    `R$ ${cpl.toFixed(2)}`,
                    `R$ ${c.spend.toFixed(2)}`
                ];
            });
            colWidths = {
                0: { cellWidth: 70 }, // Campaign Name
                1: { cellWidth: 20 }, // Status
                2: { cellWidth: 26 }, // Budget
                3: { cellWidth: 22 }, // Leads
                4: { cellWidth: 22 }, // CPL
                5: { cellWidth: 22 }  // Investido
            };
        }
        else if (reportType === 'whatsapp') {
            tableHeaders = [['Campanha', 'Status', 'Orçamento', 'Contatos (Whats)', 'Custo/Contato', 'Investido']];
            tableRows = state.filteredCampaigns.map(c => {
                let budgetStr = 'Conjunto/N/A';
                if (c.dailyBudget) budgetStr = `R$ ${c.dailyBudget.toFixed(2)}/dia`;
                else if (c.lifetimeBudget) budgetStr = `R$ ${c.lifetimeBudget.toFixed(2)} (Vit.)`;

                const cpw = c.whatsapp > 0 ? c.spend / c.whatsapp : 0;

                return [
                    c.name,
                    c.effectiveStatus || c.status,
                    budgetStr,
                    `${c.whatsapp} WhatsApp`,
                    `R$ ${cpw.toFixed(2)}`,
                    `R$ ${c.spend.toFixed(2)}`
                ];
            });
            colWidths = {
                0: { cellWidth: 68 }, // Campaign Name
                1: { cellWidth: 20 }, // Status
                2: { cellWidth: 26 }, // Budget
                3: { cellWidth: 24 }, // Contatos
                4: { cellWidth: 24 }, // Custo/Contato
                5: { cellWidth: 22 }  // Investido
            };
        }
        else if (reportType === 'branding') {
            tableHeaders = [['Campanha', 'Status', 'Orçamento', 'Cliques', 'Impressões', 'CTR', 'CPC', 'CPM', 'Investido']];
            tableRows = state.filteredCampaigns.map(c => {
                let budgetStr = 'Conjunto/N/A';
                if (c.dailyBudget) budgetStr = `R$ ${c.dailyBudget.toFixed(2)}/dia`;
                else if (c.lifetimeBudget) budgetStr = `R$ ${c.lifetimeBudget.toFixed(2)} (Vit.)`;

                const ctrVal = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0;
                const cpcVal = c.clicks > 0 ? c.spend / c.clicks : 0;
                const cpmVal = c.impressions > 0 ? (c.spend / (c.impressions / 1000)) : 0;

                return [
                    c.name,
                    c.effectiveStatus || c.status,
                    budgetStr,
                    c.clicks.toLocaleString('pt-BR'),
                    c.impressions.toLocaleString('pt-BR'),
                    `${ctrVal.toFixed(2)}%`,
                    `R$ ${cpcVal.toFixed(2)}`,
                    `R$ ${cpmVal.toFixed(2)}`,
                    `R$ ${c.spend.toFixed(2)}`
                ];
            });
            colWidths = {
                0: { cellWidth: 50 }, // Campaign Name
                1: { cellWidth: 15 }, // Status
                2: { cellWidth: 20 }, // Budget
                3: { cellWidth: 18 }, // Cliques
                4: { cellWidth: 20 }, // Impressões
                5: { cellWidth: 15 }, // CTR
                6: { cellWidth: 16 }, // CPC
                7: { cellWidth: 16 }, // CPM
                8: { cellWidth: 16 }  // Investido
            };
        }
        else { // 'all' (General Overview)
            tableHeaders = [['Campanha', 'Status', 'Orçamento', 'Resultados', 'Compras', 'ROAS / Custo']];
            tableRows = state.filteredCampaigns.map(c => {
                let budgetStr = 'Conjunto/N/A';
                if (c.dailyBudget) budgetStr = `R$ ${c.dailyBudget.toFixed(2)}/dia`;
                else if (c.lifetimeBudget) budgetStr = `R$ ${c.lifetimeBudget.toFixed(2)} (Vit.)`;

                const roasStr = c.roas > 0 ? `ROAS: ${c.roas.toFixed(2)}x` : `CPA: R$ ${c.primaryResult.cost.toFixed(2)}`;

                return [
                    c.name,
                    c.effectiveStatus || c.status,
                    budgetStr,
                    c.primaryResult.displayText,
                    `${c.purchases} Compras\n(R$ ${c.purchaseValue.toFixed(2)})`,
                    `${roasStr}\n(Inv: R$ ${c.spend.toFixed(2)})`
                ];
            });
            colWidths = {
                0: { cellWidth: 50 }, // Campaign Name
                1: { cellWidth: 20 }, // Status
                2: { cellWidth: 25 }, // Budget
                3: { cellWidth: 32 }, // Results
                4: { cellWidth: 32 }, // Purchases
                5: { cellWidth: 30 }  // ROAS/Custo
            };
        }

        // Draw Table
        doc.autoTable({
            startY: 85,
            head: tableHeaders,
            body: tableRows,
            theme: 'striped',
            headStyles: { fillColor: [43, 49, 72], textColor: 255 },
            styles: { fontSize: 8, cellPadding: 3.2 },
            columnStyles: colWidths,
            margin: { left: 14, right: 14 }
        });

        // --- PAGE 2: visual reports (Distribution bar chart and Daily trends mixed chart) ---
        doc.addPage();

        // Simple Header Banner for Page 2
        doc.setFillColor(22, 28, 45); // Dark Slate Blue banner
        doc.rect(0, 0, width, 22, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text('Relatório Visual de Distribuição e Tendência', 14, 14);

        // Chart 1: Distribution Bar Chart (Top 5 campaigns)
        let chart1Y = 32;
        const topCampaigns = [...state.filteredCampaigns]
            .sort((a, b) => b.spend - a.spend)
            .slice(0, 5);

        if (topCampaigns.length > 0) {
            doc.setTextColor(43, 49, 72);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9.5);
            doc.text('DISTRIBUIÇÃO DO INVESTIMENTO (TOP 5 CAMPANHAS)', 14, chart1Y);

            const maxSpend = Math.max(...topCampaigns.map(c => c.spend), 1);
            let currentY = chart1Y + 8;

            topCampaigns.forEach(c => {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.5);
                doc.setTextColor(80, 80, 80);
                
                // Truncate campaign name if too long
                const labelName = c.name.length > 55 ? c.name.slice(0, 52) + '...' : c.name;
                doc.text(labelName, 14, currentY);

                // Value Text
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(43, 49, 72);
                const spendValStr = `R$ ${c.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                doc.text(spendValStr, width - 14 - doc.getTextWidth(spendValStr), currentY);

                // Progress Bar Background track
                const trackWidth = width - 28;
                const trackHeight = 3;
                doc.setFillColor(235, 238, 243);
                doc.rect(14, currentY + 2, trackWidth, trackHeight, 'F');

                // Progress Bar Filled part
                const fillWidth = (c.spend / maxSpend) * trackWidth;
                doc.setFillColor(99, 102, 241); // Indigo
                doc.rect(14, currentY + 2, fillWidth, trackHeight, 'F');

                currentY += 11;
            });
        }

        // Chart 2: Daily Performance Chart (Gasto columns + Resultados line + CPA line)
        let chart2Y = 112;
        doc.setTextColor(43, 49, 72);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.text('DESEMPENHO DIÁRIO (INVESTIMENTO, RESULTADOS E CUSTO)', 14, chart2Y);

        if (state.dailyInsights && state.dailyInsights.length > 0) {
            // Determine primary metric based on reportType
            let metricKey = 'clicks';
            let metricLabel = 'Cliques';
            let cpaLabel = 'CPC';
            
            if (reportType === 'sales') {
                metricKey = 'purchases';
                metricLabel = 'Compras';
                cpaLabel = 'CPA';
            } else if (reportType === 'leads') {
                metricKey = 'leads';
                metricLabel = 'Leads';
                cpaLabel = 'CPL';
            } else if (reportType === 'whatsapp') {
                metricKey = 'whatsapp';
                metricLabel = 'Contatos';
                cpaLabel = 'Custo/Whats';
            }

            const chartHeight = 50;
            const originX = 26;
            const chartWidth = width - 42; // margin left: 26, margin right: 16
            const originY = chart2Y + chartHeight + 8; // base of the chart

            // Draw Y1 axis (Spend) on the left
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.3);
            doc.line(originX, originY, originX, originY - chartHeight); // left vertical line

            // Draw Y2 axis (Results / CPA) on the right
            doc.line(originX + chartWidth, originY, originX + chartWidth, originY - chartHeight); // right vertical line

            // Draw X axis
            doc.line(originX, originY, originX + chartWidth, originY); // bottom horizontal line

            // Get max values for scaling
            const maxSpend = Math.max(...state.dailyInsights.map(d => d.spend), 10);
            const maxResults = Math.max(...state.dailyInsights.map(d => d[metricKey]), 1);
            
            // Calculate CPA for each day and get max CPA
            const cpaValues = state.dailyInsights.map(d => d[metricKey] > 0 ? d.spend / d[metricKey] : 0);
            const maxCPA = Math.max(...cpaValues, 1);

            // Draw Y-axis labels
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(120, 120, 120);

            // Left labels (Spend)
            const labelTop = `R$ ${maxSpend.toFixed(0)}`;
            doc.text(labelTop, originX - doc.getTextWidth(labelTop) - 2, originY - chartHeight + 2);
            const labelMid = `R$ ${(maxSpend / 2).toFixed(0)}`;
            doc.text(labelMid, originX - doc.getTextWidth(labelMid) - 2, originY - (chartHeight / 2) + 2);
            const labelBot = 'R$ 0';
            doc.text(labelBot, originX - doc.getTextWidth(labelBot) - 2, originY + 2);

            // Right labels (Results & CPA)
            const rightLabelTop = `${maxResults.toFixed(0)} / R$ ${maxCPA.toFixed(0)}`;
            doc.text(rightLabelTop, originX + chartWidth + 2, originY - chartHeight + 2);
            const rightLabelMid = `${(maxResults / 2).toFixed(0)} / R$ ${(maxCPA / 2).toFixed(0)}`;
            doc.text(rightLabelMid, originX + chartWidth + 2, originY - (chartHeight / 2) + 2);
            const rightLabelBot = '0';
            doc.text(rightLabelBot, originX + chartWidth + 2, originY + 2);

            // Draw Chart Legend
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            
            // Spend Columns Legend Indicator
            doc.setFillColor(210, 215, 245);
            doc.rect(originX + 10, chart2Y + 4, 6, 4, 'F');
            doc.setTextColor(80, 80, 80);
            doc.text(`Gasto Diário (Eixo Esq.)`, originX + 18, chart2Y + 7);

            // Results Line Legend Indicator
            doc.setDrawColor(139, 92, 246); // Purple
            doc.setLineWidth(1);
            doc.line(originX + 65, chart2Y + 6, originX + 73, chart2Y + 6);
            doc.setFillColor(139, 92, 246);
            doc.circle(originX + 69, chart2Y + 6, 1, 'F');
            doc.text(`${metricLabel} (Eixo Dir.)`, originX + 76, chart2Y + 7);

            // CPA Line Legend Indicator
            doc.setDrawColor(16, 185, 129); // Emerald Green
            doc.setLineWidth(1);
            doc.line(originX + 115, chart2Y + 6, originX + 123, chart2Y + 6);
            doc.setFillColor(16, 185, 129);
            doc.circle(originX + 119, chart2Y + 6, 1, 'F');
            doc.text(`${cpaLabel} (Eixo Dir.)`, originX + 126, chart2Y + 7);

            // Plot data points
            const totalPoints = state.dailyInsights.length;
            const stepX = chartWidth / Math.max(totalPoints, 1);
            const colWidth = Math.max(stepX * 0.5, 2);

            let lastResultsPoint = null;
            let lastCpaPoint = null;

            state.dailyInsights.forEach((d, index) => {
                const x = originX + (index * stepX) + (stepX / 2);
                
                // 1. Spend Column
                const spendHeight = (d.spend / maxSpend) * chartHeight;
                doc.setFillColor(210, 215, 245);
                doc.rect(x - (colWidth / 2), originY - spendHeight, colWidth, spendHeight, 'F');

                // 2. Results Line Point
                const resultVal = d[metricKey];
                const resultsHeight = (resultVal / maxResults) * chartHeight;
                const resultsY = originY - resultsHeight;

                // 3. CPA Line Point
                const cpaVal = d[metricKey] > 0 ? d.spend / d[metricKey] : 0;
                const cpaHeight = (cpaVal / maxCPA) * chartHeight;
                const cpaY = originY - cpaHeight;

                // Draw connecting lines
                if (index > 0) {
                    // Results Line
                    doc.setDrawColor(139, 92, 246);
                    doc.setLineWidth(0.8);
                    doc.line(lastResultsPoint.x, lastResultsPoint.y, x, resultsY);

                    // CPA Line
                    doc.setDrawColor(16, 185, 129);
                    doc.line(lastCpaPoint.x, lastCpaPoint.y, x, cpaY);
                }

                // Draw circles at data points
                doc.setFillColor(139, 92, 246);
                doc.circle(x, resultsY, 0.8, 'F');
                
                doc.setFillColor(16, 185, 129);
                doc.circle(x, cpaY, 0.8, 'F');

                // Save last points
                lastResultsPoint = { x: x, y: resultsY };
                lastCpaPoint = { x: x, y: cpaY };

                // Draw date labels on X axis
                if (totalPoints <= 10 || index % Math.ceil(totalPoints / 8) === 0 || index === totalPoints - 1) {
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(5.5);
                    doc.setTextColor(140, 140, 140);
                    
                    let dateStr = d.date;
                    try {
                        const parts = d.date.split('-');
                        if (parts.length === 3) {
                            const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                            dateStr = `${parts[2]}/${months[parseInt(parts[1]) - 1]}`;
                        }
                    } catch (err) {}
                    
                    doc.text(dateStr, x - (doc.getTextWidth(dateStr) / 2), originY + 8);
                    doc.setDrawColor(220, 220, 220);
                    doc.line(x, originY, x, originY + 2); // small tick
                }
            });
        } else {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(120, 120, 120);
            doc.text('Dados diários não disponíveis para este período ou conta.', 14, chart2Y + 12);
        }

        // --- PAGE 3: individual creatives ---
        if (state.filteredAds && state.filteredAds.length > 0) {
            doc.addPage();

            // Simple header banner for Page 3
            doc.setFillColor(22, 28, 45); // Dark Slate Blue banner
            doc.rect(0, 0, width, 22, 'F');

            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.text('Análise de Performance de Criativos', 14, 14);

            // Construct ads table headers
            const creativeHeaders = [['Nome do Anúncio / Criativo', 'Campanha de Origem', 'Status', 'Resultados', 'Gasto', 'ROAS / Custo']];
            
            // Construct ads table rows
            const creativeRows = state.filteredAds.map(ad => {
                let resultStr = `${ad.linkClicks} Cliques`;
                if (ad.purchases > 0) resultStr = `${ad.purchases} Compras`;
                else if (ad.leads > 0) resultStr = `${ad.leads} Leads`;
                else if (ad.whatsapp > 0) resultStr = `${ad.whatsapp} WhatsApp`;

                let costStr = `CPC: R$ ${ad.cpc.toFixed(2)}`;
                if (ad.roas > 0) costStr = `ROAS: ${ad.roas.toFixed(2)}x`;
                else if (ad.purchases > 0) costStr = `CPA: R$ ${(ad.spend / ad.purchases).toFixed(2)}`;
                else if (ad.leads > 0) costStr = `CPL: R$ ${(ad.spend / ad.leads).toFixed(2)}`;
                else if (ad.whatsapp > 0) costStr = `Custo/Whats: R$ ${(ad.spend / ad.whatsapp).toFixed(2)}`;

                return [
                    ad.name,
                    ad.campaignName || 'N/A',
                    ad.status,
                    resultStr,
                    `R$ ${ad.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    costStr
                ];
            });

            // Draw Creatives Table
            doc.autoTable({
                startY: 30,
                head: creativeHeaders,
                body: creativeRows,
                theme: 'striped',
                headStyles: { fillColor: [43, 49, 72], textColor: 255 },
                styles: { fontSize: 7.5, cellPadding: 3 },
                columnStyles: {
                    0: { cellWidth: 55 }, // Creative Name
                    1: { cellWidth: 42 }, // Campaign Name
                    2: { cellWidth: 15 }, // Status
                    3: { cellWidth: 23 }, // Results
                    4: { cellWidth: 23 }, // Spend
                    5: { cellWidth: 28 }  // Cost/ROAS
                },
                margin: { left: 14, right: 14 }
            });
        }

        // Save PDF with descriptive name
        const filename = `relatorio-${reportType}-meta-ads-${state.datePreset}-${new Date().toISOString().slice(0, 10)}.pdf`;
        doc.save(filename);
    } catch (error) {
        console.error('Erro ao gerar o PDF:', error);
        alert('Não foi possível exportar o PDF. Detalhes: ' + error.message);
    }
}

// --- Chatbot Functionality ---
function addChatMessage(className, text) {
    const thread = document.getElementById('chat-thread');
    const msg = document.createElement('div');
    msg.className = `chat-message ${className}`;
    msg.innerHTML = text.replace(/\n/g, '<br>');
    thread.appendChild(msg);
    thread.scrollTop = thread.scrollHeight;
}

function sendQuickPrompt(promptText) {
    document.getElementById('chat-input').value = promptText;
    submitChatMessage();
}

async function submitChatMessage() {
    const input = document.getElementById('chat-input');
    const query = input.value.trim();
    if (!query) return;

    input.value = '';
    addChatMessage('user-message', query);

    setChatLoading(true);

    try {
        if (state.geminiKey) {
            // Advanced AI response using Gemini API
            await handleGeminiResponse(query);
        } else {
            // Local Heuristic analysis response
            setTimeout(() => {
                const response = handleLocalResponse(query);
                addChatMessage('bot-message', response);
                setChatLoading(false);
            }, 600);
        }
    } catch (e) {
        console.error('Chat error:', e);
        addChatMessage('bot-message', 'Oops, ocorreu um erro ao processar a resposta. Tente novamente.');
        setChatLoading(false);
    }
}

function setChatLoading(isLoading) {
    const input = document.getElementById('chat-input');
    const btn = document.getElementById('btn-chat-send');
    if (isLoading) {
        input.disabled = true;
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader" class="icon-spin-hover"></i>`;
    } else {
        input.disabled = false;
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="send"></i>`;
    }
    initializeLucide();
}

// --- Gemini API Handler ---
async function handleGeminiResponse(query) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${state.geminiKey}`;

    // Structure compact campaign data for Gemini context
    const dataset = state.filteredCampaigns.map(c => ({
        nome: c.name,
        status: c.effectiveStatus || c.status,
        objetivo: c.objective,
        orcamento: c.dailyBudget ? `R$ ${c.dailyBudget.toFixed(2)}/dia` : (c.lifetimeBudget ? `R$ ${c.lifetimeBudget.toFixed(2)} total` : 'Adset/CBO'),
        investido: c.spend,
        leads: c.leads,
        whatsapp_conversas: c.whatsapp,
        cliques: c.linkClicks,
        compras: c.purchases,
        faturamento_compras: c.purchaseValue,
        roas: c.roas,
        cpa: c.primaryResult.cost
    }));

    const balanceData = state.accountInfo ? {
        nome_conta: state.accountInfo.name,
        status_conta: state.accountInfo.status === 1 ? 'ACTIVE' : (state.accountInfo.status === 2 ? 'DISABLED' : (state.accountInfo.status === 3 ? 'UNSETTLED' : state.accountInfo.status)),
        saldo_atual_a_pagar: state.accountInfo.balance,
        gasto_total_acumulado: state.accountInfo.amountSpent,
        limite_gastos_cap: state.accountInfo.spendCap > 0 ? state.accountInfo.spendCap : 'Sem limite configurado',
        moeda: state.accountInfo.currency,
        forma_pagamento: state.accountInfo.fundingSourceDetails ? state.accountInfo.fundingSourceDetails.display_string : state.accountInfo.fundingSource
    } : null;

    const systemPrompt = `Você é um Analista de Tráfego Pago Sênior e Consultor de Marketing Digital especializado em Meta Ads.
    Você está analisando os dados da conta de anúncios act_${state.adAccountId} no período "${state.datePreset}".
    O usuário fez uma pergunta. Analise as campanhas e as informações financeiras de saldo fornecidas no dataset e responda em português do Brasil de forma concisa, comercial e consultiva.
    Use formatação de texto limpa (negrito para valores, quebras de linha e tópicos). 
    Quando cabível, calcule métricas como CPA, CPL, ROAS médio, ou responda sobre o saldo da conta de anúncios e limites de gastos.
    
    Dados de Saldo/Cobrança da Conta:
    ${balanceData ? JSON.stringify(balanceData, null, 2) : 'Não carregados'}
    
    Dados de Campanhas Atuais:
    ${JSON.stringify(dataset, null, 2)}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `${systemPrompt}\n\nPergunta do Usuário: "${query}"`
                    }]
                }]
            })
        });

        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error.message || 'Erro na API do Gemini.');
        }

        const reply = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] ? data.candidates[0].content.parts[0].text : '';
        
        if (!reply) {
            throw new Error('Nenhuma resposta retornada do modelo.');
        }

        addChatMessage('bot-message', reply);
    } catch (err) {
        console.error('Gemini error:', err);
        addChatMessage('bot-message', `[Aviso: Gemini API falhou (${err.message}). Utilizando Analista Heurístico Local para responder]\n\n` + handleLocalResponse(query));
    } finally {
        setChatLoading(false);
    }
}

// --- Local Heuristic Rule-Based Chatbot ---
function handleLocalResponse(query) {
    const lower = query.toLowerCase();
    
    // 0. Account Balance / Billing queries
    if (lower.includes('saldo') || lower.includes('limite') || lower.includes('pagamento') || lower.includes('cobrança') || lower.includes('cobranca') || lower.includes('pre-pago') || lower.includes('pre pago') || lower.includes('pós-pago') || lower.includes('pos pago')) {
        if (!state.accountInfo) {
            return "Ainda não carreguei os dados financeiros da conta de anúncios. Por favor, certifique-se de preencher o Token e o ID e sincronizar os dados clicando em **Sincronizar Dados** primeiro.";
        }
        const info = state.accountInfo;
        const currency = info.currency;
        const balanceStr = formatCurrency(info.balance, currency);
        const spentStr = formatCurrency(info.amountSpent, currency);
        const capStr = info.spendCap > 0 ? formatCurrency(info.spendCap, currency) : "Sem limite configurado";
        
        let statusStr = "Ativa";
        if (info.status === 2) statusStr = "Desativada";
        else if (info.status === 3) statusStr = "Pendente de Pagamento";
        else if (info.status === 7) statusStr = "Em Análise de Risco";
        else if (info.status === 8) statusStr = "Aguardando Liquidação";
        else if (info.status === 9) statusStr = "Período de Graça";
        
        let fundingStr = info.fundingSource || 'Automático';
        if (info.fundingSourceDetails && info.fundingSourceDetails.display_string) {
            fundingStr = `${info.fundingSourceDetails.display_string} (${fundingStr})`;
        }

        let remainingStr = "Sem limite";
        if (info.spendCap > 0) {
            remainingStr = formatCurrency(Math.max(0, info.spendCap - info.amountSpent), currency);
        }

        return `Aqui estão as informações de **Saldo e Cobrança** obtidas da conta **"${info.name || 'Meta Ads'}"**:
        
        *   **Status da Conta de Anúncios:** **${statusStr}**
        *   **Saldo Atual (A Pagar / Em Carteira):** **${balanceStr}**
        *   **Total Gasto Acumulado (Vitalício):** ${spentStr}
        *   **Limite Máximo (Spend Cap):** ${capStr}
        *   **Saldo Restante do Limite:** **${remainingStr}**
        *   **Forma de Pagamento Principal:** ${fundingStr}
        *   **Moeda da Conta:** ${currency}`;
    }

    if (state.filteredCampaigns.length === 0) {
        return "Não encontrei nenhuma campanha ativa/carregada para analisar. Por favor, conecte sua conta do Meta Ads e sincronize os dados primeiro!";
    }

    // 1. ROAS queries
    if (lower.includes('roas') || lower.includes('retorno')) {
        if (lower.includes('melhor') || lower.includes('maior')) {
            const copy = [...state.filteredCampaigns].sort((a, b) => b.roas - a.roas);
            const best = copy[0];
            if (best && best.roas > 0) {
                return `A campanha com o **melhor ROAS** é **"${best.name}"** com **${best.roas.toFixed(2)}x** de retorno. 
                <div class="insight-highlight insight-success">
                    Ela gerou <span class="insight-metric">${best.purchases} compras</span> com um faturamento de **R$ ${best.purchaseValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}** sob um investimento de **R$ ${best.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}**.
                </div>`;
            } else {
                return "Nenhuma das campanhas exibidas registrou conversão de compra para calcular o ROAS. Verifique o CPA/CPL ou mude o filtro para visualizar todas.";
            }
        }
        if (lower.includes('pior') || lower.includes('menor')) {
            const campaignsWithSpend = state.filteredCampaigns.filter(c => c.spend > 0);
            if (campaignsWithSpend.length === 0) return "Nenhuma campanha com investimento registrado neste período.";
            const copy = [...campaignsWithSpend].sort((a, b) => a.roas - b.roas);
            const worst = copy[0];
            return `A campanha com o **pior ROAS** (com gasto registrado) é **"${worst.name}"** com **${worst.roas.toFixed(2)}x** de retorno. Ela gastou **R$ ${worst.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}** e gerou apenas faturamento de R$ ${worst.purchaseValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`;
        }
    }

    // 2. Leads queries
    if (lower.includes('lead') || lower.includes('cadastro') || lower.includes('cadastros')) {
        if (lower.includes('melhor') || lower.includes('mais') || lower.includes('maior')) {
            const copy = [...state.filteredCampaigns].sort((a, b) => b.leads - a.leads);
            const best = copy[0];
            if (best && best.leads > 0) {
                const cpl = best.spend / best.leads;
                return `A campanha que capturou **mais leads** foi a **"${best.name}"**, registrando **${best.leads} leads**. 
                <div class="insight-highlight">
                    Custo por Lead (CPL): <span class="insight-metric">R$ ${cpl.toFixed(2)}</span> (Total investido: R$ ${best.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).
                </div>`;
            }
            return "Nenhuma campanha registrou captura de leads neste período.";
        }
    }

    // 3. WhatsApp/Conversas queries
    if (lower.includes('whatsapp') || lower.includes('conversa') || lower.includes('conversas') || lower.includes('mensagem')) {
        if (lower.includes('melhor') || lower.includes('mais') || lower.includes('maior')) {
            const copy = [...state.filteredCampaigns].sort((a, b) => b.whatsapp - a.whatsapp);
            const best = copy[0];
            if (best && best.whatsapp > 0) {
                const cpw = best.spend / best.whatsapp;
                return `A campanha com **mais conversas iniciadas no WhatsApp** é a **"${best.name}"**, com **${best.whatsapp} conversas**. 
                <div class="insight-highlight">
                    Custo por Conversa: <span class="insight-metric">R$ ${cpw.toFixed(2)}</span> (Investimento total: R$ ${best.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).
                </div>`;
            }
            return "Nenhuma campanha registrou início de conversas no WhatsApp neste período.";
        }
    }

    // 4. Budget & Spend queries
    if (lower.includes('gasto') || lower.includes('gastou') || lower.includes('investimento') || lower.includes('orçamento')) {
        const copy = [...state.filteredCampaigns].sort((a, b) => b.spend - a.spend);
        const mostExpensive = copy[0];
        let totalSpend = state.filteredCampaigns.reduce((acc, c) => acc + c.spend, 0);
        return `A conta investiu um total de **R$ ${totalSpend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}** no período selecionado. 
        A campanha que **mais consumiu verba** foi **"${mostExpensive.name}"**, com um gasto de **R$ ${mostExpensive.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}** (que representa ${((mostExpensive.spend / totalSpend) * 100).toFixed(1)}% do gasto total).`;
    }

    // 5. Purchases queries
    if (lower.includes('compra') || lower.includes('compras') || lower.includes('venda') || lower.includes('vendas')) {
        const copy = [...state.filteredCampaigns].sort((a, b) => b.purchases - a.purchases);
        const best = copy[0];
        if (best && best.purchases > 0) {
            return `A campanha que gerou **mais compras** foi **"${best.name}"** com **${best.purchases} conversões**. 
            Ela representou faturamento de **R$ ${best.purchaseValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}** na conta de anúncios.`;
        }
        return "Nenhuma campanha registrou compras no período selecionado.";
    }

    // 6. Summary queries
    if (lower.includes('resumo') || lower.includes('geral') || lower.includes('desempenho') || lower.includes('conta')) {
        let totalSpend = 0;
        let totalPurchases = 0;
        let totalLeads = 0;
        let totalWhatsapp = 0;
        let totalValue = 0;
        
        state.filteredCampaigns.forEach(c => {
            totalSpend += c.spend;
            totalPurchases += c.purchases;
            totalLeads += c.leads;
            totalWhatsapp += c.whatsapp;
            totalValue += c.purchaseValue;
        });

        const activeCount = state.filteredCampaigns.filter(c => c.effectiveStatus === 'ACTIVE' || c.status === 'ACTIVE').length;
        const avgRoas = totalSpend > 0 ? (totalValue / totalSpend) : 0;

        return `Aqui está o **Resumo de Desempenho Executivo** da conta:
        
        *   **Campanhas Analisadas:** ${state.filteredCampaigns.length} (${activeCount} ativas)
        *   **Total Investido:** R$ ${totalSpend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        *   **Retorno de Compras (Faturamento):** R$ ${totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        *   **ROAS Consolidado:** ${avgRoas.toFixed(2)}x
        *   **Volume de Leads:** ${totalLeads} leads (CPL Médio: R$ ${(totalLeads > 0 ? totalSpend / totalLeads : 0).toFixed(2)})
        *   **Volume de WhatsApp:** ${totalWhatsapp} conversas (Custo/Conversa Médio: R$ ${(totalWhatsapp > 0 ? totalSpend / totalWhatsapp : 0).toFixed(2)})`;
    }

    // Heuristic Fallback
    return `Olá! Não consegui identificar comandos específicos na sua pergunta.
    Tente me perguntar coisas como:
    *   *"Qual campanha tem o melhor ROAS?"*
    *   *"Qual campanha gerou mais leads?"*
    *   *"Qual gastou mais?"*
    *   *"Resumo geral"*`;
}

// --- Creative Modal Management ---
function openCreativeModal(campaignId, adId) {
    const campaign = state.campaigns.find(c => c.id === campaignId);
    if (!campaign) return;
    const ad = campaign.ads.find(a => a.id === adId);
    if (!ad) return;

    document.getElementById('modal-ad-name').innerText = ad.name || 'Sem nome';
    document.getElementById('modal-creative-title').innerText = ad.title || 'Sem título';
    document.getElementById('modal-creative-body').innerText = ad.body || 'Sem texto principal (copy)';
    document.getElementById('modal-ad-id').innerText = ad.id || 'N/A';

    const img = document.getElementById('modal-creative-img');
    const placeholder = document.getElementById('modal-creative-placeholder');

    if (ad.imageUrl || ad.thumbnailUrl) {
        img.src = ad.imageUrl || ad.thumbnailUrl;
        img.style.display = 'block';
        placeholder.style.display = 'none';
    } else {
        img.src = '';
        img.style.display = 'none';
        placeholder.style.display = 'flex';
    }

    const modal = document.getElementById('creative-modal');
    modal.classList.add('open');
}

function closeCreativeModal() {
    const modal = document.getElementById('creative-modal');
    modal.classList.remove('open');
}

// Bind to window for global inline onclick support
window.openCreativeModal = openCreativeModal;
window.closeCreativeModal = closeCreativeModal;

// --- Filter and Render Ads/Creatives Grid ---
function filterAndRenderAds() {
    const searchQuery = document.getElementById('search-ads').value.toLowerCase().trim();
    const showActiveOnly = document.getElementById('filter-active-ads').checked;
    const sortBy = document.getElementById('sort-ads').value;

    // Filter state.ads
    state.filteredAds = state.ads.filter(ad => {
        // Name Search Filter
        if (searchQuery && !ad.name.toLowerCase().includes(searchQuery)) {
            return false;
        }
        // Active Status Filter
        if (showActiveOnly && ad.status !== 'ACTIVE') {
            return false;
        }
        return true;
    });

    // Ranking and Sorting
    state.filteredAds.sort((a, b) => {
        if (sortBy === 'spend_desc') {
            return b.spend - a.spend;
        } else if (sortBy === 'purchases_desc') {
            return b.purchases - a.purchases;
        } else if (sortBy === 'leads_desc') {
            return b.leads - a.leads;
        } else if (sortBy === 'whatsapp_desc') {
            return b.whatsapp - a.whatsapp;
        } else if (sortBy === 'roas_desc') {
            return b.roas - a.roas;
        } else if (sortBy === 'clicks_desc') {
            return b.linkClicks - a.linkClicks;
        }
        return 0;
    });

    renderAdsGrid();
}

function renderAdsGrid() {
    const grid = document.getElementById('ads-grid-container');
    const countLabel = document.getElementById('table-ads-count');
    
    grid.innerHTML = '';
    
    if (state.filteredAds.length === 0) {
        grid.innerHTML = `
            <div class="grid-empty-state">
                <i data-lucide="image"></i>
                <p>Nenhum criativo corresponde aos filtros aplicados.</p>
            </div>
        `;
        countLabel.innerText = 'Nenhum criativo correspondente';
        initializeLucide();
        return;
    }

    countLabel.innerText = `Mostrando ${state.filteredAds.length} anúncios ordenados por ranking`;

    state.filteredAds.forEach(ad => {
        const card = document.createElement('div');
        card.className = 'ad-card';
        card.addEventListener('click', () => openCreativeModal(ad.campaignId, ad.id));

        // Preview section
        const previewArea = document.createElement('div');
        previewArea.className = 'ad-card-preview';
        
        if (ad.thumbnailUrl || ad.imageUrl) {
            const img = document.createElement('img');
            img.src = ad.thumbnailUrl || ad.imageUrl;
            img.alt = ad.name;
            previewArea.appendChild(img);
        } else {
            previewArea.innerHTML = `
                <div class="creative-placeholder">
                    <i data-lucide="image"></i>
                    <p>Sem Imagem</p>
                </div>
            `;
        }
        
        // Info Section
        const info = document.createElement('div');
        info.className = 'ad-card-info';
        
        const title = document.createElement('div');
        title.className = 'ad-card-title';
        title.innerText = ad.name;
        title.title = ad.name;
        
        const campaignName = document.createElement('div');
        campaignName.className = 'ad-card-campaign';
        campaignName.innerText = ad.campaignName || 'Campanha desconhecida';
        campaignName.title = ad.campaignName;

        // Metrics Grid
        const metrics = document.createElement('div');
        metrics.className = 'ad-card-metrics';

        // Spend Box
        const spendBox = createMetricBox('Gasto', `R$ ${ad.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        
        // Primary Results Box based on what is populated
        let primaryLabel = 'Cliques';
        let primaryVal = ad.linkClicks;
        if (ad.purchases > 0) {
            primaryLabel = 'Compras';
            primaryVal = ad.purchases;
        } else if (ad.leads > 0) {
            primaryLabel = 'Leads';
            primaryVal = ad.leads;
        } else if (ad.whatsapp > 0) {
            primaryLabel = 'WhatsApp';
            primaryVal = ad.whatsapp;
        }
        const resultBox = createMetricBox(primaryLabel, primaryVal.toLocaleString('pt-BR'));

        // Custo por Resultado / ROAS Box
        let costLabel = 'ROAS';
        let costVal = `${ad.roas.toFixed(2)}x`;
        if (ad.roas === 0) {
            if (ad.purchases > 0) {
                costLabel = 'CPA';
                costVal = `R$ ${(ad.spend / ad.purchases).toFixed(2)}`;
            } else if (ad.leads > 0) {
                costLabel = 'CPL';
                costVal = `R$ ${(ad.spend / ad.leads).toFixed(2)}`;
            } else if (ad.whatsapp > 0) {
                costLabel = 'Custo/Conversa';
                costVal = `R$ ${(ad.spend / ad.whatsapp).toFixed(2)}`;
            } else {
                costLabel = 'CPC';
                costVal = `R$ ${ad.cpc.toFixed(2)}`;
            }
        }
        const costBox = createMetricBox(costLabel, costVal);

        // Click Box
        const clicksBox = createMetricBox('Cliques (CPC)', `${ad.linkClicks} (R$ ${ad.cpc.toFixed(2)})`);

        metrics.appendChild(spendBox);
        metrics.appendChild(resultBox);
        metrics.appendChild(clicksBox);
        metrics.appendChild(costBox);

        info.appendChild(title);
        info.appendChild(campaignName);
        info.appendChild(metrics);

        // Footer Section
        const footer = document.createElement('div');
        footer.className = 'ad-card-footer';
        
        const status = document.createElement('span');
        const isActive = ad.status === 'ACTIVE';
        status.className = `ad-status-pill ${isActive ? 'status-active' : 'status-paused'}`;
        status.innerHTML = `<span class="status-dot"></span><span>${ad.status}</span>`;
        
        const linkIcon = document.createElement('i');
        linkIcon.setAttribute('data-lucide', 'maximize-2');
        linkIcon.style.width = '14px';
        linkIcon.style.height = '14px';
        linkIcon.style.color = 'var(--text-muted)';

        footer.appendChild(status);
        footer.appendChild(linkIcon);

        card.appendChild(previewArea);
        card.appendChild(info);
        card.appendChild(footer);
        
        grid.appendChild(card);
    });

    initializeLucide();
}

function createMetricBox(label, value) {
    const box = document.createElement('div');
    box.className = 'metric-box';
    
    const lbl = document.createElement('span');
    lbl.className = 'metric-box-label';
    lbl.innerText = label;
    
    const val = document.createElement('span');
    val.className = 'metric-box-value';
    val.innerText = value;
    
    box.appendChild(lbl);
    box.appendChild(val);
    return box;
}

// Bind to window for global inline action triggers
window.filterAndRenderAds = filterAndRenderAds;
window.switchTab = switchTab;

// --- Balance Rendering Helpers ---
function formatCurrency(value, currencyCode = 'BRL') {
    const locale = currencyCode === 'BRL' ? 'pt-BR' : 'en-US';
    const options = { style: 'currency', currency: currencyCode };
    try {
        return parseFloat(value || 0).toLocaleString(locale, options);
    } catch (e) {
        const symbol = currencyCode === 'BRL' ? 'R$' : (currencyCode === 'USD' ? '$' : currencyCode);
        return `${symbol} ${parseFloat(value || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
}

function renderBalance() {
    if (!state.accountInfo) {
        document.getElementById('balance-account-name').innerText = 'Nenhum dado de saldo disponível';
        document.getElementById('balance-account-id').innerText = 'Sincronize a conta para carregar';
        
        const badge = document.getElementById('balance-status-badge');
        badge.className = 'status-pill status-paused';
        badge.querySelector('.status-text').innerText = 'Desconectado';
        
        document.getElementById('kpi-balance-amount').innerText = 'R$ 0,00';
        document.getElementById('kpi-balance-spent').innerText = 'R$ 0,00';
        document.getElementById('kpi-balance-cap').innerText = 'R$ 0,00';
        document.getElementById('kpi-balance-remaining').innerText = 'R$ 0,00';
        
        document.getElementById('balance-progress-card').style.display = 'none';
        return;
    }

    const info = state.accountInfo;
    const currency = info.currency;

    // 1. Header Info
    document.getElementById('balance-account-name').innerText = info.name || 'Conta de Anúncios';
    document.getElementById('balance-account-id').innerText = `ID da Conta: act_${state.adAccountId.replace('act_', '')}`;

    // 2. Status Badge
    const badge = document.getElementById('balance-status-badge');
    const badgeText = badge.querySelector('.status-text');
    
    // Status codes: 1=ACTIVE, 2=DISABLED, 3=UNSETTLED, 7=PENDING_RISK_REVIEW, 8=PENDING_SETTLEMENT, 9=IN_GRACE_PERIOD, 100=PENDING_CLOSURE, 101=CLOSED
    if (info.status === 1) {
        badge.className = 'status-pill status-active';
        badgeText.innerText = 'Ativa';
        badge.removeAttribute('style');
    } else if (info.status === 2) {
        badge.className = 'status-pill status-paused';
        badge.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
        badge.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        badge.style.color = 'var(--danger)';
        badgeText.innerText = 'Desativada';
    } else if (info.status === 3) {
        badge.className = 'status-pill status-paused';
        badge.style.backgroundColor = 'rgba(245, 158, 11, 0.15)';
        badge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
        badge.style.color = 'var(--warning)';
        badgeText.innerText = 'Pendente de Pagamento';
    } else if (info.status === 7) {
        badge.className = 'status-pill status-paused';
        badgeText.innerText = 'Em Análise de Risco';
        badge.removeAttribute('style');
    } else if (info.status === 8) {
        badge.className = 'status-pill status-paused';
        badgeText.innerText = 'Aguardando Liquidação';
        badge.removeAttribute('style');
    } else if (info.status === 9) {
        badge.className = 'status-pill status-paused';
        badgeText.innerText = 'Período de Graça';
        badge.removeAttribute('style');
    } else {
        badge.className = 'status-pill status-paused';
        badgeText.innerText = `Status: ${info.status}`;
        badge.removeAttribute('style');
    }

    // 3. KPI Cards
    document.getElementById('kpi-balance-amount').innerText = formatCurrency(info.balance, currency);
    document.getElementById('kpi-balance-spent').innerText = formatCurrency(info.amountSpent, currency);

    // Spend cap details
    if (info.spendCap > 0) {
        document.getElementById('kpi-balance-cap').innerText = formatCurrency(info.spendCap, currency);
        
        // Calculate remaining limit
        const remaining = Math.max(0, info.spendCap - info.amountSpent);
        document.getElementById('kpi-balance-remaining').innerText = formatCurrency(remaining, currency);
        document.getElementById('kpi-balance-remaining-meta').innerText = 'Restante até o limite';

        // Show Progress Bar
        const progressCard = document.getElementById('balance-progress-card');
        progressCard.style.display = 'block';
        
        const percent = Math.min(100, (info.amountSpent / info.spendCap) * 100);
        document.getElementById('balance-progress-percent').innerText = `${percent.toFixed(1)}%`;
        document.getElementById('balance-progress-fill').style.width = `${percent}%`;
        document.getElementById('balance-progress-text').innerText = `${formatCurrency(info.amountSpent, currency)} gastos do limite de ${formatCurrency(info.spendCap, currency)}`;
    } else {
        document.getElementById('kpi-balance-cap').innerText = 'Sem Limite';
        document.getElementById('kpi-balance-cap-meta').innerText = 'Sem limite de gastos máximo';
        
        document.getElementById('kpi-balance-remaining').innerText = 'Ilimitado';
        document.getElementById('kpi-balance-remaining-meta').innerText = 'Usa forma de pagamento padrão';
        
        document.getElementById('balance-progress-card').style.display = 'none';
    }

    // 4. Details Section
    document.getElementById('detail-currency').innerText = `${currency} (${currency === 'BRL' ? 'Real Brasileiro' : 'Dólar Americano'})`;

    // Payment method details
    let payMethodStr = 'Desconhecido';
    let fundingTypeStr = 'Pós-pago / Automático';
    
    if (info.fundingSourceDetails) {
        const details = info.fundingSourceDetails;
        payMethodStr = details.display_string || payMethodStr;
        if (details.type) {
            fundingTypeStr = `${details.type} (${info.fundingSource || 'Automático'})`;
        }
    } else if (info.fundingSource) {
        payMethodStr = info.fundingSource;
    }
    
    if (info.fundingSource === 'PREPAY' || (info.fundingSourceDetails && info.fundingSourceDetails.type === 'PREPAY')) {
        fundingTypeStr = 'Pré-pago / Manual';
        document.getElementById('kpi-balance-meta').innerText = 'Saldo disponível em carteira';
    } else {
        document.getElementById('kpi-balance-meta').innerText = 'Saldo devedor acumulado (A Pagar)';
    }

    document.getElementById('detail-payment-method').innerText = payMethodStr;
    document.getElementById('detail-funding-type').innerText = fundingTypeStr;

    // Active Coupons
    let couponsStr = 'Nenhum';
    if (info.fundingSourceDetails && info.fundingSourceDetails.coupons && info.fundingSourceDetails.coupons.length > 0) {
        const couponList = info.fundingSourceDetails.coupons.map(c => `${formatCurrency(c.amount / 100, c.currency)} (Expira: ${c.expiry_date || 'N/A'})`);
        couponsStr = couponList.join(', ');
    }
    document.getElementById('detail-coupons').innerText = couponsStr;

    // Refresh Lucide Icons inside the balance tab
    initializeLucide();
}
