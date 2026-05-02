const fs = require('fs');
const csv = require('csv-parser');
const { Parser } = require('json2csv');
const puppeteer = require('puppeteer');

// ================= CONFIGURAÇÕES =================
const ARQUIVO_ENTRADA = 'ordens.csv';           // Arquivo com as ordens para consultar
const ARQUIVO_SAIDA = 'resultado_consulta.csv'; // Arquivo de saída com os CPFs
const URL_BASE = 'http://appwfm.gvt.net.br/wfm-search/detalhesWorkOrder.xhtml?wo='; // URL com parâmetro wo=
const TEMPO_ESPERA_MS = 3000;                    // Tempo de espera entre consultas (evita bloqueio)
// ===============================================

async function processarOrdensCSV() {
    console.log('🤖 Robô WFM CSV Iniciado...');
    
    // 1. Ler as ordens do arquivo CSV
    const ordens = await lerOrdensCSV(ARQUIVO_ENTRADA);
    console.log(`📋 ${ordens.length} ordens encontradas para processar.`);
    
    if (ordens.length === 0) {
        console.log('⚠️ Nenhuma ordem válida encontrada no CSV.');
        return;
    }
    
    // 2. Processar cada ordem no navegador
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
                // Pega a coluna "Ordem" e remove espaços/quebras
                if (row.Ordem && row.Ordem.trim()) {
                    ordens.push(row.Ordem.trim());
                }
            })
            .on('end', () => resolve(ordens))
            .on('error', (err) => reject(err));
    });
}

async function consultarOrdensNoWFM(listaOrdens) {
    // Lança o navegador
    // headless: false = mostra a janela (útil para debug e login manual se necessário)
    // headless: true = roda escondido (mais rápido, mas pode exigir login automatizado)
    const browser = await puppeteer.launch({ 
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // Evita problemas em alguns ambientes
    });
    
    const page = await browser.newPage();
    
    // Configura user-agent para parecer um navegador real (evita alguns bloqueios)
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    const resultados = [];

    try {
        // 🔐 Se o sistema exigir login, faça manualmente na primeira execução com headless: false
        // Depois que logar, o Puppeteer manterá a sessão enquanto o navegador estiver aberto
        
        console.log('\n💡 Dica: Se o sistema pedir login, faça manualmente na janela que abriu.');
        console.log('⏳ Aguarde 30 segundos se precisar logar antes de continuar...\n');
        // Aguarda tempo para login manual (opcional - remova se não precisar)
        // await new Promise(r => setTimeout(r, 30000));

        for (let i = 0; i < listaOrdens.length; i++) {
            const ordemAtual = listaOrdens[i];
            const urlCompleta = `${URL_BASE}${ordemAtual}`;
            
            console.log(`\n[${i + 1}/${listaOrdens.length}] 🔍 Consultando Ordem: ${ordemAtual}`);
            console.log(`   URL: ${urlCompleta}`);
            
            try {
                // Acessa a página com a ordem específica
                await page.goto(urlCompleta, { 
                    waitUntil: 'networkidle0', // Aguarda carregamento completo
                    timeout: 30000 
                });
                
                // Aguarda o elemento da ordem aparecer (confirma que a página carregou os dados)
                await page.waitForSelector('#val_ordem', { timeout: 10000 });
                
                // Extrai os dados diretamente do DOM da página
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
                
                // Valida se a ordem retornada bate com a consultada
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
                console.log(`   ❌ Erro ao consultar: ${error.message}`);
                resultados.push({
                    Ordem: ordemAtual,
                    Documento: 'Erro na consulta',
                    Nome: '',
                    Status: '',
                    DataConsulta: new Date().toLocaleString('pt-BR'),
                    Observacao: error.message
                });
            }
            
            // Aguarda entre consultas para não sobrecarregar o servidor
            if (i < listaOrdens.length - 1) {
                console.log(`   ⏳ Aguardando ${TEMPO_ESPERA_MS/1000}s antes da próxima...`);
                await new Promise(r => setTimeout(r, TEMPO_ESPERA_MS));
            }
        }
        
        // Salvar resultados no CSV de saída
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
    const parser = new Parser({ fields, delimiter: ';' }); // Usa ponto-e-vírgula para Excel BR
    const csvContent = parser.parse(dados);
    
    fs.writeFileSync(ARQUIVO_SAIDA, csvContent, 'utf-8');
    console.log(`\n💾 Resultados salvos em: ${ARQUIVO_SAIDA}`);
    console.log(`📊 Total: ${dados.length} registros processados.`);
    
    // Exibe resumo rápido
    const comCPF = dados.filter(d => d.Documento && d.Documento !== 'Não encontrado' && d.Documento !== 'Erro na consulta').length;
    console.log(`✅ Com CPF encontrado: ${comCPF}`);
    console.log(`❌ Sem CPF/Erro: ${dados.length - comCPF}`);
}

// ================= EXECUÇÃO =================
processarOrdensCSV().catch(console.error);
