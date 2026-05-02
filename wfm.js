const fs = require('fs');
const csv = require('csv-parser');
const { Parser } = require('json2csv');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Ativa o plugin stealth para evitar detecção
puppeteer.use(StealthPlugin());

// ================= CONFIGURAÇÕES =================
const ARQUIVO_ENTRADA = 'ordens.csv';
const ARQUIVO_SAIDA = 'resultado_consulta.csv';
const URL_BASE = 'http://appwfm.gvt.net.br/wfm-search/detalhesWorkOrder.xhtml?wo=';
const TEMPO_ESPERA_MS = 5000; // Aumentado para evitar rate limit
// ===============================================

async function processarOrdensCSV() {
    console.log('🤖 Robô WFM CSV Iniciado (Modo Stealth)...');
    
    const ordens = await lerOrdensCSV(ARQUIVO_ENTRADA);
    console.log(`📋 ${ordens.length} ordens encontradas.`);
    
    if (ordens.length === 0) return;
    
    await consultarOrdensNoWFM(ordens);
}

async function lerOrdensCSV(caminhoArquivo) {
    return new Promise((resolve) => {
        const ordens = [];
        if (!fs.existsSync(caminhoArquivo)) {
            console.error(`❌ Arquivo '${caminhoArquivo}' não encontrado.`);
            resolve([]);
            return;
        }
        fs.createReadStream(caminhoArquivo)
            .pipe(csv())
            .on('data', (row) => {
                if (row.Ordem?.trim()) ordens.push(row.Ordem.trim());
            })
            .on('end', () => resolve(ordens))
            .on('error', () => resolve([]));
    });
}

async function consultarOrdensNoWFM(listaOrdens) {
    const browser = await puppeteer.launch({ 
        headless: false, // Mantenha visível para debug
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-web-security',
            '--disable-features=site-per-process'
        ],
        ignoreHTTPSErrors: true
    });
    
    const page = await browser.newPage();
    
    // Configura headers para parecer navegador real
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Upgrade-Insecure-Requests': '1'
    });
    
    // User-Agent realista
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Intercepta requests para logging e bypass de bloqueios
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        // Bloqueia recursos desnecessários para acelerar
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
            req.abort();
        } else {
            req.continue();
        }
    });
    
    page.on('requestfailed', (req) => {
        console.log(`   ⚠️ Request falhou: ${req.failure()?.errorText} - ${req.url()}`);
    });

    const resultados = [];

    try {
        console.log('\n💡 Dica: Faça login manualmente na janela se necessário.');
        console.log('⏳ Aguarde 30s se precisar autenticar...\n');
        // Descomente abaixo se precisar de tempo para login manual
        // await new Promise(r => setTimeout(r, 30000));

        for (let i = 0; i < listaOrdens.length; i++) {
            const ordemAtual = listaOrdens[i];
            const urlCompleta = `${URL_BASE}${ordemAtual}`;
            
            console.log(`\n[${i + 1}/${listaOrdens.length}] 🔍 Ordem: ${ordemAtual}`);
            
            try {
                await page.goto(urlCompleta, { 
                    waitUntil: 'domcontentloaded', // Mais rápido que networkidle0
                    timeout: 40000 
                });
                
                // Aguarda elemento principal
                await page.waitForSelector('#val_ordem', { timeout: 15000 });
                
                // Pequena pausa para garantir renderização
                await page.waitForTimeout(1000);
                
                const dados = await page.evaluate(() => {
                    const get = (id) => {
                        const el = document.querySelector(id);
                        return el?.innerText?.trim() || null;
                    };
                    return {
                        ordem: get('#val_ordem'),
                        documento: get('#val_documento'),
                        nome: get('#val_nome_cli'),
                        status: get('#val_status')
                    };
                });
                
                if (dados.ordem === ordemAtual && dados.documento) {
                    console.log(`   ✅ CPF: ${dados.documento}`);
                    resultados.push({
                        Ordem: ordemAtual,
                        Documento: dados.documento,
                        Nome: dados.nome || '',
                        Status: dados.status || '',
                        DataConsulta: new Date().toLocaleString('pt-BR')
                    });
                } else {
                    console.log(`   ⚠️ Dados incompletos. Ordem: ${dados.ordem}, Doc: ${dados.documento}`);
                    resultados.push({
                        Ordem: ordemAtual,
                        Documento: dados.documento || 'Não encontrado',
                        Nome: '', Status: '',
                        DataConsulta: new Date().toLocaleString('pt-BR'),
                        Observacao: `Ordem retornada: ${dados.ordem}`
                    });
                }
                
            } catch (error) {
                console.log(`   ❌ Erro: ${error.message}`);
                // Tira screenshot para debug
                try {
                    await page.screenshot({ path: `erro_ordem_${ordemAtual}.png` });
                    console.log(`   📸 Screenshot salvo: erro_ordem_${ordemAtual}.png`);
                } catch {}
                
                resultados.push({
                    Ordem: ordemAtual,
                    Documento: 'Erro na consulta',
                    Nome: '', Status: '',
                    DataConsulta: new Date().toLocaleString('pt-BR'),
                    Observacao: error.message
                });
            }
            
            if (i < listaOrdens.length - 1) {
                await new Promise(r => setTimeout(r, TEMPO_ESPERA_MS));
            }
        }
        
        salvarResultadosCSV(resultados);
        
    } catch (error) {
        console.error('❌ Erro crítico:', error);
    } finally {
        await browser.close();
        console.log('\n🏁 Robô finalizado.');
    }
}

function salvarResultadosCSV(dados) {
    if (dados.length === 0) return;
    const fields = ['Ordem', 'Documento', 'Nome', 'Status', 'DataConsulta', 'Observacao'];
    const parser = new Parser({ fields, delimiter: ';' });
    fs.writeFileSync(ARQUIVO_SAIDA, parser.parse(dados), 'utf-8');
    console.log(`\n💾 Salvo em: ${ARQUIVO_SAIDA}`);
    const ok = dados.filter(d => d.Documento && d.Documento !== 'Erro na consulta' && d.Documento !== 'Não encontrado').length;
    console.log(`✅ Sucesso: ${ok} | ❌ Falha: ${dados.length - ok}`);
}

processarOrdensCSV().catch(console.error);
