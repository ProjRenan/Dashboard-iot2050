/* ═══════════════════════════════════════════════
   IoT2050 Dashboard — app.js
   Comunicação: MQTT via HiveMQ Cloud (WSS)
   Hospedagem:  Netlify (qualquer lugar)
   Acesso:      Celular e PC pela internet
═══════════════════════════════════════════════ */

'use strict';

/* ═══ CONFIGURAÇÃO MQTT ═══════════════════════ */
const CONFIG = {
    host:     '610c167271144fcd85123c447dfc72bd.s1.eu.hivemq.cloud', // ← seu host do HiveMQ
    port:     8884,                    // WSS — obrigatório no browser
    usuario:  'saae',           // ← seu usuário HiveMQ
    senha:    '31415926',             // ← sua senha HiveMQ
    clientId: 'netlify_' + Math.random().toString(16).slice(2, 8)
};

/* ═══ TÓPICOS MQTT ════════════════════════════ */
const TOPICOS = {
    DI:     'iot2050/io/digital/entrada/#',
    AI:     'iot2050/io/analogico/#',
    CMD_DO: 'iot2050/io/digital/saida/D8'
};

/* ═══ VARIÁVEIS GLOBAIS ═══════════════════════ */
let cliente = null;
let totalAtualizacoes = 0;

/* ═══ UTILITÁRIOS ═════════════════════════════ */
function horaAtual() {
    return new Date().toLocaleTimeString('pt-BR', { hour12: false });
}

function setText(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
}

/* ═══ STATUS DE CONEXÃO ═══════════════════════ */
function setStatus(estado) {
    const bolinha = document.getElementById('bolinhaStatus');
    const texto   = document.getElementById('textoStatus');

    bolinha.classList.remove('conectado', 'erro', 'aguardando');

    const estados = {
        conectado:   { classe: 'conectado',  texto: 'HiveMQ conectado'  },
        erro:        { classe: 'erro',       texto: 'Sem conexão'        },
        aguardando:  { classe: 'aguardando', texto: 'Conectando...'      }
    };

    const cfg = estados[estado];
    if (cfg) {
        bolinha.classList.add(cfg.classe);
        texto.textContent = cfg.texto;
    }
}

/* ═══ CONEXÃO MQTT ════════════════════════════ */
function conectar() {
    setStatus('aguardando');

    const url = `wss://${CONFIG.host}:${CONFIG.port}/mqtt`;

    cliente = mqtt.connect(url, {
        clientId:        CONFIG.clientId,
        username:        CONFIG.usuario,
        password:        CONFIG.senha,
        clean:           true,
        reconnectPeriod: 5000,   // tenta reconectar a cada 5s
        connectTimeout:  10000   // timeout de 10s
    });

    /* ── Conectado ── */
    cliente.on('connect', function () {
        setStatus('conectado');
        console.log('MQTT conectado ao HiveMQ');

        // Assina entradas digitais
        cliente.subscribe(TOPICOS.DI, { qos: 1 }, function (err) {
            if (err) console.error('Erro ao assinar DI:', err);
            else     console.log('Inscrito em:', TOPICOS.DI);
        });

        // Assina entradas analógicas
        cliente.subscribe(TOPICOS.AI, { qos: 1 }, function (err) {
            if (err) console.error('Erro ao assinar AI:', err);
            else     console.log('Inscrito em:', TOPICOS.AI);
        });
    });

    /* ── Mensagem recebida ── */
    cliente.on('message', function (topico, mensagem) {
       let dados;
        try {
            dados = JSON.parse(mensagem.toString());
        } catch (e) {
            console.error('Payload inválido:', mensagem.toString());
            return;
        }

        console.log('Mensagem recebida:', topico, dados);

        // Roteamento por tópico
        if (topico.startsWith('iot2050/io/digital/entrada/')) {
            atualizarDI(dados);
        } else if (topico.startsWith('iot2050/io/analogico/')) {
            atualizarAI(dados);
        }

        // Atualiza contador
        totalAtualizacoes++;
        setText('contadorMsgs', totalAtualizacoes + ' atualizações');
    });

    /* ── Erro ── */
    cliente.on('error', function (err) {
        setStatus('erro');
        console.error('Erro MQTT:', err.message);
    });

    /* ── Desconectado ── */
    cliente.on('close', function () {
        setStatus('erro');
        console.log('MQTT desconectado. Tentando reconectar...');
    });

    /* ── Reconectando ── */
    cliente.on('reconnect', function () {
        setStatus('aguardando');
        console.log('Reconectando ao HiveMQ...');
    });
}

/* ═══ ATUALIZAR ENTRADA DIGITAL ══════════════ */
function atualizarDI(dados) {
    // Garante inteiro
    const valor  = parseInt(dados.valor) === 1 ? 1 : 0;
    const estado = valor === 1 ? 'LIGADO' : 'DESLIGADO';
    const classe = valor === 1 ? 'ligado' : 'desligado';
    const hora   = dados.timestamp
        ? dados.timestamp.slice(11, 19)
        : horaAtual();

    // Atualiza LED
    const led = document.getElementById('led-DI');
    if (led) {
        led.classList.remove('ligado', 'desligado');
        led.classList.add(classe);
    }

    // Atualiza card
    const card = document.getElementById('card-DI');
    if (card) {
        card.classList.remove('ligado', 'desligado');
        card.classList.add(classe);
    }

    // Atualiza textos
    setText('estado-DI',  estado);
    setText('valor-DI',   valor);
    setText('horario-DI', hora);
}

/* ═══ ATUALIZAR ENTRADA ANALÓGICA ════════════ */
function atualizarAI(dados) {
    const hora = dados.timestamp
        ? dados.timestamp.slice(11, 19)
        : horaAtual();

    // Atualiza barra de progresso
    const barra = document.getElementById('barra-AI');
    if (barra) {
        barra.style.width = Math.min(100, dados.percentual ?? 0) + '%';
    }

    // Atualiza valores
    setText('raw-AI',        dados.raw           ?? '—');
    setText('tensao-AI',    (dados.tensao_V      ?? '—') + ' V');
    setText('corrente-AI',  (dados.corrente_mA   ?? '—') + ' mA');
    setText('percentual-AI',(dados.percentual    ?? '—') + ' %');
    setText('horario-AI',    hora);
}

/* ═══ ENVIAR COMANDO SAÍDA DIGITAL ═══════════ */
function enviarComando(comando) {
    // Verifica conexão antes de enviar
    if (!cliente || !cliente.connected) {
        alert('Sem conexão com o broker. Aguarde reconexão.');
        return;
    }

    // Desabilita botões enquanto publica
    document.getElementById('btn-ligar').disabled    = true;
    document.getElementById('btn-desligar').disabled = true;

    // Publica o comando no tópico do IoT2050
    cliente.publish(TOPICOS.CMD_DO, comando, { qos: 1 }, function (err) {
        // Reabilita os botões sempre
        document.getElementById('btn-ligar').disabled    = false;
        document.getElementById('btn-desligar').disabled = false;

        if (err) {
            console.error('Erro ao publicar comando:', err.message);
            alert('Erro ao enviar comando.');
            return;
        }

        // Atualiza visual do card DO
        const ligou  = ['LIGAR','1','ON','TRUE'].includes(comando.toUpperCase());
        const classe = ligou ? 'ligado'   : 'desligado';
        const estado = ligou ? 'LIGADO'   : 'DESLIGADO';

        const card = document.getElementById('card-DO');
        if (card) {
            card.classList.remove('ligado', 'desligado');
            card.classList.add(classe);
        }

        setText('estado-DO',  estado);
        setText('horario-DO', horaAtual());

        console.log('Comando enviado:', comando, '→', TOPICOS.CMD_DO);
    });
}

/* ═══ INICIALIZAÇÃO ═══════════════════════════ */
document.addEventListener('DOMContentLoaded', function () {
    console.log('Dashboard iniciado. Conectando ao HiveMQ...');
    conectar();
});
