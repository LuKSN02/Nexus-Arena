/* ==========================================================================
   data.js — Conteúdo semente (notícias, produtos, categorias)
   Arte: todas as ilustrações são geradas em SVG abstrato/geométrico próprio
   (gradientes + formas), sem logos, marcas ou artes de terceiros.
   ========================================================================== */

const CATEGORIES = [
  { key: 'geral', label: 'Geral', color: '#2fd9c7' },
  { key: 'lol', label: 'League of Legends', color: '#3fa9ff' },
  { key: 'cs2', label: 'CS2', color: '#ffb93d' },
  { key: 'valorant', label: 'Valorant', color: '#ff3b5c' },
  { key: 'freefire', label: 'Free Fire', color: '#ff8a3d' },
  { key: 'dota2', label: 'Dota 2', color: '#c34fff' },
  { key: 'overwatch2', label: 'Overwatch 2', color: '#ff5b9e' },
  { key: 'r6siege', label: 'Rainbow Six Siege', color: '#4ddb7a' },
  { key: 'rocketleague', label: 'Rocket League', color: '#4fd6ff' },
  { key: 'apex', label: 'Apex Legends', color: '#ffd23f' },
  { key: 'pubg', label: 'PUBG Battlegrounds', color: '#f2a65a' },
  { key: 'mlbb', label: 'Mobile Legends', color: '#8c7cff' },
  { key: 'fortnite', label: 'Fortnite', color: '#5be3c9' }
];

function catInfo(key){
  return CATEGORIES.find(c => c.key === key) || CATEGORIES[0];
}

/* Gera uma arte abstrata (faixas diagonais + anel + grid de pontos) tingida
   pela cor da categoria — usada em heróis, cards de notícia e modais. */
function gameArt(catKey, seedNum = 1){
  const c = catInfo(catKey);
  const id = `art_${catKey}_${seedNum}_${Math.random().toString(36).slice(2, 6)}`;
  return `
  <svg class="gfx" viewBox="0 0 600 340" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="${id}bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0d1119"/>
        <stop offset="100%" stop-color="#161b28"/>
      </linearGradient>
      <linearGradient id="${id}fx" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c.color}" stop-opacity=".85"/>
        <stop offset="100%" stop-color="${c.color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="600" height="340" fill="url(#${id}bg)"/>
    <g opacity=".9">
      <polygon points="0,340 220,340 420,60 260,60" fill="url(#${id}fx)"/>
      <polygon points="600,0 600,220 430,340 330,340" fill="${c.color}" opacity=".14"/>
    </g>
    <circle cx="480" cy="90" r="120" fill="none" stroke="${c.color}" stroke-opacity=".35" stroke-width="1.5"/>
    <circle cx="480" cy="90" r="70" fill="none" stroke="${c.color}" stroke-opacity=".55" stroke-width="1.5"/>
    <g fill="${c.color}" opacity=".6">
      ${Array.from({ length: 24 }).map((_, i) => {
        const x = 24 + (i % 8) * 26;
        const y = 260 + Math.floor(i / 8) * 20;
        return `<circle cx="${x}" cy="${y}" r="1.6"/>`;
      }).join('')}
    </g>
    <line x1="0" y1="0" x2="600" y2="340" stroke="${c.color}" stroke-opacity=".08" stroke-width="40"/>
  </svg>`;
}

const NEWS = [
  {
    id: 'n1', category: 'valorant',
    title: 'Franquia brasileira confirma line-up para a próxima split internacional',
    excerpt: 'Após semanas de rumores, a organização anunciou três contratações e a saída do IGL histórico do time.',
    content: [
      'A equipe confirmou nesta semana a formação que vai representar o país na próxima temporada internacional de Valorant. A movimentação foi antecipada por bastidores, mas a confirmação oficial só chegou após o encerramento da janela de transferências.',
      'Entre as mudanças, o destaque fica para a contratação de um duelista que vinha se destacando na segunda divisão e a chegada de um analista tático que já passou por outras regiões competitivas.',
      'A organização também anunciou um novo centro de treinamento, com foco em preparação física e mental dos atletas, algo que vem se tornando padrão entre as equipes de ponta.'
    ],
    author: 'Redação Nexus', likes: 214, comments: 18, readTime: 4
  },
  {
    id: 'n2', category: 'cs2',
    title: 'Atualização de mapas reorganiza o meta competitivo do circuito principal',
    excerpt: 'Ajustes de economia e a revisão de dois mapas do pool ativo devem mudar as estratégias das equipes top 10.',
    content: [
      'A desenvolvedora publicou uma atualização que altera pontos de colisão, iluminação e alguns ângulos considerados desequilibrados em dois mapas do pool competitivo ativo.',
      'Analistas do circuito já apontam que equipes que dependiam de execuções específicas precisarão revisar seus scripts de rodada para a próxima etapa da temporada.',
      'A mudança também afeta o ritmo econômico das partidas, com pequenos ajustes nos preços de utilitários que podem incentivar rounds de força com mais frequência.'
    ],
    author: 'Redação Nexus', likes: 342, comments: 41, readTime: 5
  },
  {
    id: 'n3', category: 'lol',
    title: 'Campeão reformulado chega ao servidor de testes com kit totalmente novo',
    excerpt: 'Rework promete trazer o personagem de volta à relevância na rota do meio após anos fora do meta competitivo.',
    content: [
      'O personagem, que não recebia atualizações estruturais há anos, ganhou um conjunto de habilidades reformulado que aposta em mobilidade e controle de área.',
      'Jogadores profissionais que testaram a versão em ambiente fechado descreveram o novo kit como "de alto teto técnico", sugerindo curva de aprendizado íngreme.',
      'A expectativa é que a mudança chegue ao servidor principal nas próximas semanas, a tempo de ser avaliada antes da próxima fase de classificatórias.'
    ],
    author: 'Redação Nexus', likes: 501, comments: 76, readTime: 6
  },
  {
    id: 'n4', category: 'freefire',
    title: 'Copa regional bate recorde de audiência simultânea na fase de grupos',
    excerpt: 'Transmissão oficial ultrapassou marcas anteriores mesmo com a competição concorrendo com outros eventos do calendário.',
    content: [
      'A organização do torneio confirmou números recordes de espectadores simultâneos durante a fase de grupos, superando edições anteriores da mesma competição.',
      'Parte do crescimento é atribuída à entrada de novas equipes regionais, que trouxeram torcidas locais mais engajadas para as transmissões.',
      'A grande final está marcada para o próximo mês, em uma arena com capacidade para milhares de espectadores presenciais.'
    ],
    author: 'Redação Nexus', likes: 178, comments: 22, readTime: 3
  },
  {
    id: 'n5', category: 'dota2',
    title: 'Nova métrica de "impacto por minuto" divide opinião de analistas',
    excerpt: 'Ferramenta estatística promete avaliar desempenho individual além do tradicional KDA, mas nem todos concordam com o modelo.',
    content: [
      'Um grupo de analistas de dados apresentou uma nova métrica que tenta medir o impacto real de um jogador na partida, considerando presença em objetivos e controle de mapa.',
      'A proposta já gerou debate entre comentaristas, que questionam se o modelo consegue capturar decisões de risco tomadas em frações de segundo.',
      'Apesar da divergência, equipes de análise de pelo menos três organizações confirmaram que já testam a métrica internamente.'
    ],
    author: 'Redação Nexus', likes: 96, comments: 14, readTime: 5
  },
  {
    id: 'n6', category: 'geral',
    title: 'Pesquisa aponta crescimento de 18% no público de e-sports no último ano',
    excerpt: 'Levantamento indica aumento expressivo de audiência entre o público de 16 a 24 anos em plataformas de streaming.',
    content: [
      'O levantamento, conduzido com espectadores de múltiplas plataformas, aponta crescimento consistente no consumo de conteúdo competitivo ao vivo.',
      'O público mais jovem segue como o principal motor desse crescimento, mas a pesquisa também identificou aumento relevante entre espectadores acima de 30 anos.',
      'Marcas de fora do setor de tecnologia começam a direcionar mais investimento para patrocínios no cenário competitivo, segundo o mesmo estudo.'
    ],
    author: 'Redação Nexus', likes: 133, comments: 9, readTime: 4
  },
  {
    id: 'n7', category: 'valorant',
    title: 'Agente com foco em controle de área recebe ajustes de equilíbrio',
    excerpt: 'Mudanças reduzem tempo de recarga de habilidade que vinha dominando o pick rate em mapas menores.',
    content: [
      'A desenvolvedora anunciou ajustes pontuais em uma das habilidades mais usadas do agente, que vinha aparecendo em quase todas as partidas de nível profissional.',
      'A redução no tempo de recarga busca abrir espaço para outras escolhas na mesma função, sem remover a identidade do personagem.',
      'Equipes já reagiram nas redes sociais, com opiniões divididas entre os que aprovam o ajuste e os que preferiam uma mudança mais agressiva.'
    ],
    author: 'Redação Nexus', likes: 267, comments: 33, readTime: 3
  },
  {
    id: 'n8', category: 'cs2',
    title: 'Organização tradicional anuncia retorno ao competitivo após dois anos',
    excerpt: 'Equipe volta ao circuito principal com formação majoritariamente nova e treinador vindo do cenário europeu.',
    content: [
      'Depois de um hiato de dois anos fora do circuito principal, a organização confirmou o retorno com uma formação quase inteiramente renovada.',
      'O novo treinador, com passagens recentes pelo cenário europeu, assume o desafio de reconstruir a identidade competitiva da equipe.',
      'A estreia está marcada para a fase classificatória do próximo torneio regional, ainda sem data divulgada publicamente.'
    ],
    author: 'Redação Nexus', likes: 189, comments: 27, readTime: 4
  },
  {
    id: 'n9', category: 'overwatch2',
    title: 'Nova temporada competitiva reduz de cinco para três o número de papéis obrigatórios',
    excerpt: 'Mudança no formato de composição de equipe busca acelerar o ritmo das partidas e ampliar as estratégias possíveis.',
    content: [
      'A desenvolvedora confirmou que a próxima temporada competitiva chega com um formato de composição mais flexível, reduzindo exigências fixas de papéis dentro da equipe.',
      'A expectativa entre analistas é de que o meta se torne mais dinâmico, com equipes podendo experimentar composições pouco vistas nas temporadas anteriores.',
      'Times profissionais já iniciaram bootcamps para testar as novas combinações antes do início oficial da fase classificatória.'
    ],
    author: 'Redação Nexus', likes: 152, comments: 19, readTime: 4
  },
  {
    id: 'n10', category: 'r6siege',
    title: 'Operador recém-lançado se torna pick obrigatório na primeira semana de torneio',
    excerpt: 'Taxa de escolha acima de 90% em partidas oficiais levanta debate sobre necessidade de ajuste emergencial.',
    content: [
      'O operador mais recente do jogo apareceu em praticamente todas as partidas da primeira etapa do torneio regional, gerando reclamações de equipes adversárias.',
      'A organizadora do campeonato afirmou que está monitorando os dados de utilização antes de decidir por qualquer ação em conjunto com a desenvolvedora.',
      'Comentaristas apontam que casos assim costumam se resolver naturalmente conforme as equipes desenvolvem estratégias de contenção.'
    ],
    author: 'Redação Nexus', likes: 121, comments: 16, readTime: 3
  },
  {
    id: 'n11', category: 'rocketleague',
    title: 'Equipe sul-americana garante vaga inédita em mundial após campanha invicta',
    excerpt: 'Campanha perfeita na fase regional coloca a organização entre as favoritas ao título pela primeira vez.',
    content: [
      'A equipe encerrou a fase classificatória regional sem perder um único confronto, resultado inédito na história recente da competição local.',
      'O trio, formado majoritariamente por jogadores reserva promovidos ainda no início da temporada, chamou atenção pela consistência nas rodadas decisivas.',
      'A organização confirmou período de treinos intensivos em parceria com uma equipe europeia como preparação para o torneio mundial.'
    ],
    author: 'Redação Nexus', likes: 174, comments: 21, readTime: 4
  },
  {
    id: 'n12', category: 'apex',
    title: 'Nova legenda chega com habilidade que já divide opiniões entre profissionais',
    excerpt: 'Kit focado em controle de rota promete impactar diretamente a fase de posicionamento inicial das partidas.',
    content: [
      'A legenda mais recente do battle royale foi liberada para o servidor de testes com um conjunto de habilidades voltado ao controle de movimentação em área.',
      'Jogadores profissionais que testaram o personagem em partidas privadas descreveram o kit como "de impacto imediato" no início de round.',
      'A desenvolvedora ainda não confirmou se haverá ajustes antes da liberação oficial para o modo competitivo.'
    ],
    author: 'Redação Nexus', likes: 203, comments: 24, readTime: 3
  },
  {
    id: 'n13', category: 'pubg',
    title: 'Circuito global anuncia expansão para mais duas regiões a partir da próxima temporada',
    excerpt: 'Novas ligas regionais devem aumentar o número total de equipes participantes do campeonato mundial.',
    content: [
      'A organizadora do circuito confirmou a criação de duas novas ligas regionais, ampliando o alcance competitivo do jogo para mercados ainda pouco explorados.',
      'A mudança deve aumentar a quantidade de vagas disponíveis para o mundial, beneficiando equipes que historicamente disputavam classificatórias abertas.',
      'Organizações locais já manifestaram interesse em formar equipes profissionais assim que o formato das novas ligas for detalhado.'
    ],
    author: 'Redação Nexus', likes: 98, comments: 11, readTime: 4
  },
  {
    id: 'n14', category: 'mlbb',
    title: 'Final regional bate recorde de ingressos vendidos em arena fechada',
    excerpt: 'Evento presencial esgotou lugares semanas antes da data, refletindo crescimento da base de torcedores mobile.',
    content: [
      'Os ingressos para a grande final regional se esgotaram semanas antes da data do evento, número inédito para uma competição do gênero na região.',
      'A organização confirmou estrutura de transmissão ampliada, com telões adicionais do lado de fora da arena para acomodar torcedores sem ingresso.',
      'O crescimento é atribuído em parte à popularização de transmissões feitas por criadores de conteúdo focados no cenário mobile.'
    ],
    author: 'Redação Nexus', likes: 231, comments: 29, readTime: 3
  },
  {
    id: 'n15', category: 'fortnite',
    title: 'Atualização de meio de temporada reformula sistema de construção em torneios',
    excerpt: 'Limite de materiais por partida busca equilibrar disputas entre estilos de jogo mais agressivos e defensivos.',
    content: [
      'A atualização mais recente introduz um limite ajustado de materiais de construção durante partidas competitivas, mudança que vinha sendo pedida por parte da comunidade.',
      'Jogadores que apostam em estilo mais defensivo criticaram a mudança, enquanto equipes de perfil agressivo comemoraram o ajuste.',
      'A organizadora do circuito confirmou que a regra já vale a partir da próxima etapa classificatória.'
    ],
    author: 'Redação Nexus', likes: 165, comments: 22, readTime: 3
  }
];

const PRODUCTS = [
  {
    id: 'p1', name: 'Mouse Óptico Strike Pro 26K', category: 'mouse',
    price: 349.9, oldPrice: 429.9, rating: 4.7, reviews: 812, tag: 'Mais vendido',
    desc: 'Sensor óptico de 26.000 DPI, switches óticos com 80 milhões de cliques e peso de 58g.',
    image: 'assets/products/p1.jpg' // coloque o arquivo em assets/products/ com esse nome
  },
  {
    id: 'p2', name: 'Mouse Wireless Vector Air', category: 'mouse',
    price: 279.9, rating: 4.5, reviews: 340,
    desc: 'Conexão sem fio de baixa latência, bateria de 70h e revestimento emborrachado texturizado.',
    image: 'assets/products/p2.jpg' // coloque o arquivo em assets/products/ com esse nome
  },
  {
    id: 'p3', name: 'Teclado Mecânico Aegis TKL', category: 'teclado',
    price: 519.0, oldPrice: 599.0, rating: 4.8, reviews: 1204, tag: 'Escolha da equipe',
    desc: 'Switches mecânicos hot-swap, corpo em alumínio escovado e iluminação RGB por tecla.',
    image: 'assets/products/p3.jpg' // coloque o arquivo em assets/products/ com esse nome
  },
  {
    id: 'p4', name: 'Teclado Compacto Nova 60%', category: 'teclado',
    price: 389.9, rating: 4.4, reviews: 256,
    desc: 'Formato compacto 60% para máxima mobilidade do mouse, com keycaps PBT dupla injeção.',
    image: 'assets/products/p4.jpg' // coloque o arquivo em assets/products/ com esse nome
  },
  {
    id: 'p5', name: 'Headset Aurora 7.1 Surround', category: 'headset',
    price: 459.9, oldPrice: 549.9, rating: 4.6, reviews: 673,
    desc: 'Áudio surround virtual 7.1, drivers de 50mm e microfone com cancelamento de ruído.',
    image: 'assets/products/p5.jpg' // coloque o arquivo em assets/products/ com esse nome
  },
  {
    id: 'p6', name: 'Headset Wireless Voltage Lite', category: 'headset',
    price: 329.0, rating: 4.3, reviews: 198,
    desc: 'Até 30h de bateria, conexão de baixa latência 2.4GHz e almofadas em espuma viscoelástica.',
    image: 'assets/products/p6.jpg' // coloque o arquivo em assets/products/ com esse nome
  },
  {
    id: 'p7', name: 'Mousepad Extended Arena XL', category: 'mouse',
    price: 99.9, rating: 4.7, reviews: 421,
    desc: 'Base emborrachada antiderrapante, 900x400mm, costura reforçada nas bordas.',
    image: 'assets/products/p7.jpg' // coloque o arquivo em assets/products/ com esse nome
  },
  {
    id: 'p8', name: 'Passe de Temporada — Ligas Nexus', category: 'virtual',
    price: 49.9, rating: 4.9, reviews: 2310, tag: 'Digital',
    desc: 'Acesso a recompensas exclusivas, moldura de perfil animada e emblema sazonal na plataforma.',
    image: 'assets/products/p8.jpg' // coloque o arquivo em assets/products/ com esse nome
  },
  {
    id: 'p9', name: 'Pacote de Moedas Nexus — 5.000', category: 'virtual',
    price: 39.9, rating: 4.6, reviews: 987, tag: 'Digital',
    desc: 'Moedas para uso na loja de itens cosméticos e enquetes de conteúdo da plataforma.',
    image: 'assets/products/p9.jpg' // coloque o arquivo em assets/products/ com esse nome
  },
  {
    id: 'p10', name: 'Suporte de Headset Forge Stand', category: 'mouse',
    price: 89.9, rating: 4.5, reviews: 156,
    desc: 'Base em aço com hub USB integrado de 2 portas e antiderrapante de silicone.',
    image: 'assets/products/p10.jpg' // coloque o arquivo em assets/products/ com esse nome
  },
  {
    id: 'p11', name: 'Teclado 96% Meridian Pro', category: 'teclado',
    price: 649.0, rating: 4.8, reviews: 302, tag: 'Premium',
    desc: 'Layout 96% com tela OLED de status, gabinete gasket-mount e cabo destacável trançado.',
    image: 'assets/products/p11.jpg' // coloque o arquivo em assets/products/ com esse nome
  },
  {
    id: 'p12', name: 'Headset Pro Comp Titan', category: 'headset',
    price: 599.0, oldPrice: 699.0, rating: 4.9, reviews: 540, tag: 'Uso profissional',
    desc: 'Usado por equipes profissionais, com haste de microfone rígida e isolamento acústico reforçado.'
  }
];

const PRODUCT_CATS = [
  { key: 'mouse', label: 'Mouses e acessórios', icon: 'mouse' },
  { key: 'teclado', label: 'Teclados', icon: 'keyboard' },
  { key: 'headset', label: 'Headsets', icon: 'headset' },
  { key: 'virtual', label: 'Itens virtuais', icon: 'diamond' }
];

const AVAILABLE_BADGES = [
  { key: 'founder', icon: 'shield', cls: 'b-signal', title: 'Membro fundador' },
  { key: 'buyer', icon: 'tag', cls: 'b-gold', title: 'Comprador verificado' },
  { key: 'analyst', icon: 'trending', cls: 'b-teal', title: 'Analista da comunidade' }
];

const BANNER_COLORS = ['#ff3b5c', '#2fd9c7', '#ffb93d', '#3fa9ff', '#c34fff', '#1a1e2c'];

/* Cupons de desconto válidos na loja (demonstração) */
const COUPONS = [
  { code: 'NEXUS10', type: 'percent', value: 10, label: '10% de desconto no pedido' },
  { code: 'BEMVINDO20', type: 'percent', value: 20, label: '20% de desconto de boas-vindas' },
  { code: 'FRETEGRATIS', type: 'shipping', value: 0, label: 'Frete grátis' }
];
