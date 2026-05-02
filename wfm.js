const fs = require('fs');
const csv = require('csv-parser');
const { Parser } = require('json2csv');
const puppeteer = require('puppeteer');

// ================= CONFIGURAÇÕES =================
const ARQUIVO_ENTRADA = 'ordens.csv';
const ARQUIVO_SAIDA = 'resultado_consulta.csv';
const URL_BASE = 'http://appwfm.gvt.net.br/wfm-search/detalhesWorkOrder.xhtml?wo=';
const TEMPO_ESPERA_MS = 3000;
// ===============================================

async function processarOrdensCSV() {
    console.log('🤖 Robô WFM CSV Iniciado...');
    
    const ordens = await lerOrdensCSV(ARQUIVO_ENTRADA);
    console.log(`📋 ${ordens.length} ordens encontradas para processar.`);
    
    if (ordens.length === 0) {
        console.log('⚠️ Nenhuma ordem válida encontrada no CSV.');
        return;
    }
    
    await consultarOrdensNoWFM(ordens);
}

async function lerOrdensCSV(caminhoArquivo) {
    return new Promise((resolve, reject) => {
        const ordens = [];
        
        if (!fs.existsSync(caminhoArquivo)) {
            console.error(`❌ Arquivo '${caminhoArquivo}' não encontrado.`);
            resolve([]);
            return;
        }
        
        fs.createReadStream(caminhoArquivo)
            .pipe(csv())
            .on('data', (row) => {
                if (row.Ordem && row.Ordem.trim()) {
                    ordens.push(row.Ordem.trim());
                }
            })
            .on('end', () => resolve(ordens))
            .on('error', (err) => reject(err));
    });
}

async function consultarOrdensNoWFM(listaOrdens) {
    const browser = await puppeteer.launch({ 
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    const resultados = [];

    try {
        console.log('\n💡 Se o sistema pedir login, faça manualmente na janela que abriu.');

        for (let i = 0; i < listaOrdens.length; i++) {
            const ordemAtual = listaOrdens[i];
            const urlCompleta = `${URL_BASE}${ordemAtual}`;
            
            console.log(`\n[${i + 1}/${listaOrdens.length}] 🔍 Consultando Ordem: ${ordemAtual}`);
            
            try {
                await page.goto(urlCompleta, { 
                    waitUntil: 'networkidle0',
                    timeout: 30000 
                });
                
                await page.waitForSelector('#val_ordem', { timeout: 10000 });
                
                const dados = await page.evaluate(() => {
                    const getElemento = (id) => {
                        const el = document.querySelector(id);
                        return el ? el.innerText.trim() : null;
                    };
                    
                    return {
                        ordem: getElemento('#val_ordem'),
                        documento: getElemento('#val_documento'),
                        nome: getElemento('#val_nome_cli'),
                        protocolo: getElemento('#val_protocolo'),
                        status: getElemento('#val_status')
                    };
                });
                
                if (dados.ordem === ordemAtual) {
                    console.log(`   ✅ Sucesso! CPF: ${dados.documento || 'Não informado'}`);
                    resultados.push({
                        Ordem: ordemAtual,
                        Documento: dados.documento || 'Não encontrado',
                        Nome: dados.nome || '',
                        Status: dados.status || '',
                        DataConsulta: new Date().toLocaleString('pt-BR')
                    });
                } else {
                    console.log(`   ⚠️ Ordem retornada diferente: ${dados.ordem}`);
                    resultados.push({
                        Ordem: ordemAtual,
                        Documento: 'Ordem não encontrada',
                        Nome: '',
                        Status: '',
                        DataConsulta: new Date().toLocaleString('pt-BR'),
                        Observacao: `Página retornou ordem: ${dados.ordem}`
                    });
                }
                
            } catch (error) {
                console.log(`   ❌ Erro: ${error.message}`);
                resultados.push({
                    Ordem: ordemAtual,
                    Documento: 'Erro na consulta',
                    Nome: '',
                    Status: '',
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
    if (dados.length === 0) {
        console.log('⚠️ Nenhum dado para salvar.');
        return;
    }
    
    const fields = ['Ordem', 'Documento', 'Nome', 'Status', 'DataConsulta', 'Observacao'];
    const parser = new Parser({ fields, delimiter: ';' });
    const csvContent = parser.parse(dados);
    
    fs.writeFileSync(ARQUIVO_SAIDA, csvContent, 'utf-8');
    console.log(`\n💾 Resultados salvos em: ${ARQUIVO_SAIDA}`);
    
    const comCPF = dados.filter(d => d.Documento && d.Documento !== 'Não encontrado' && d.Documento !== 'Erro na consulta').length;
    console.log(`✅ Com CPF: ${comCPF} | ❌ Sem CPF/Erro: ${dados.length - comCPF}`);
}

processarOrdensCSV().catch(console.error);
