const os = (book, page) => `https://openstax.org/books/${book}/pages/${page}`;
export const domains = [
  { id: 'science', name: '自然科学', subtitle: '从一片天空，到整个宇宙', keywords: ['物理', '地理', '地图', '天文', '天空', '四季', '引力'], icon: 'Orbit' },
  { id: 'life', name: '生命与人体', subtitle: '重新认识这个鲜活的世界', keywords: ['生物', '细胞', '生命', '人体', '基因', '进化'], icon: 'Sprout' },
  { id: 'history', name: '历史与文明', subtitle: '在过去，寻找今天的来路', keywords: ['历史', '文明', '农业', '贸易', '工业', '革命'], icon: 'Landmark' },
  { id: 'economics', name: '经济与选择', subtitle: '看见每次选择背后的逻辑', keywords: ['经济', '成本', '供需', '通胀', '贸易', '公共品'], icon: 'ChartNoAxesCombined' },
  { id: 'psychology', name: '心理与思维', subtitle: '理解世界，也理解自己', keywords: ['心理', '记忆', '认知', '学习', '因果', '偏差'], icon: 'Brain' },
  { id: 'technology', name: '科技与互联网', subtitle: '拆开习以为常的技术', keywords: ['科技', '互联网', '网络', '浏览器', 'HTTP', 'DNS', '缓存'], icon: 'Cpu' },
];

// Editorial scope is intentionally narrower than the full field.
export const sourceCatalog = [
  ['s-map', 'science', 'Mercator', 'PROJ', 'https://proj.org/en/stable/operations/projections/merc.html', 'projection|distortions'],
  ['s-sky', 'science', 'Dispersion: The Rainbow and Prisms', 'OpenStax Physics', os('college-physics-2e', '25-5-dispersion-the-rainbow-and-prisms'), 'rainbow'],
  ['s-season', 'science', 'Facts About Earth', 'NASA', 'https://science.nasa.gov/earth/facts/', 'tilt'],
  ['s-gravity', 'science', 'Newton’s Universal Law of Gravitation', 'OpenStax Physics', os('college-physics-2e', '6-5-newtons-universal-law-of-gravitation'), 'force'],
  ['s-moon', 'science', 'Moon Phases', 'NASA', 'https://science.nasa.gov/moon/moon-phases/', 'illuminated'],
  ['l-cell', 'life', 'Eukaryotic Cells', 'OpenStax Biology 2e', os('biology-2e', '4-3-eukaryotic-cells'), 'mitochondria'],
  ['l-osmosis', 'life', 'Passive Transport', 'OpenStax Biology 2e', os('biology-2e', '5-2-passive-transport'), 'osmosis'],
  ['l-enzyme', 'life', 'Enzymes', 'OpenStax Biology 2e', os('biology-2e', '6-5-enzymes'), 'activation energy'],
  ['l-dna', 'life', 'The Genetic Code', 'OpenStax Biology 2e', os('biology-2e', '15-1-the-genetic-code'), 'codon'],
  ['l-evolution', 'life', 'Understanding Evolution', 'OpenStax Biology 2e', os('biology-2e', '18-1-understanding-evolution'), 'natural selection'],
  ['h-agriculture', 'history', 'The Neolithic Revolution', 'OpenStax World History 1', os('world-history-volume-1', '2-3-the-neolithic-revolution'), 'agriculture'],
  ['h-cities', 'history', 'Early Civilizations', 'OpenStax World History 1', os('world-history-volume-1', '3-1-early-civilizations'), 'surpluses'],
  ['h-trade', 'history', 'The Roots of African Trade', 'OpenStax World History 2', os('world-history-volume-2', '3-1-the-roots-of-african-trade'), 'Oasis towns'],
  ['h-industry', 'history', 'The Second Industrial Revolution', 'OpenStax World History 2', os('world-history-volume-2', '9-1-the-second-industrial-revolution'), 'electricity'],
  ['h-evidence', 'history', 'Causation and Interpretation in History', 'OpenStax World History 2', os('world-history-volume-2', '1-3-causation-and-interpretation-in-history'), 'caus'],
  ['e-cost', 'economics', 'Choice in a World of Scarcity', 'OpenStax Economics 3e', os('principles-economics-3e', '2-1-how-individuals-make-choices-based-on-their-budget-constraint'), 'opportunity cost'],
  ['e-demand', 'economics', 'Demand, Supply, and Equilibrium', 'OpenStax Economics 3e', os('principles-economics-3e', '3-1-demand-supply-and-equilibrium-in-markets-for-goods-and-services'), 'quantity demanded'],
  ['e-trade', 'economics', 'Absolute and Comparative Advantage', 'OpenStax Economics 3e', os('principles-economics-3e', '33-1-absolute-and-comparative-advantage'), 'opportunity cost'],
  ['e-public', 'economics', 'Public Goods', 'OpenStax Economics 3e', os('principles-economics-3e', '13-3-public-goods'), 'nonexcludable'],
  ['e-inflation', 'economics', 'How to Measure Changes in the Cost of Living', 'OpenStax Economics 3e', os('principles-economics-3e', '22-2-how-to-measure-changes-in-the-cost-of-living'), 'basket'],
  ['p-memory', 'psychology', 'How Memory Functions', 'OpenStax Psychology 2e', os('psychology-2e', '8-1-how-memory-functions'), 'semantic encoding'],
  ['p-recall', 'psychology', 'Ways to Enhance Memory', 'OpenStax Psychology 2e', os('psychology-2e', '8-4-ways-to-enhance-memory'), 'rehearsal'],
  ['p-bias', 'psychology', 'Problem Solving', 'OpenStax Psychology 2e', os('psychology-2e', '7-3-problem-solving'), 'confirmation bias'],
  ['p-cause', 'psychology', 'Analyzing Findings', 'OpenStax Psychology 2e', os('psychology-2e', '2-3-analyzing-findings'), 'causation'],
  ['p-learning', 'psychology', 'Classical Conditioning', 'OpenStax Psychology 2e', os('psychology-2e', '6-2-classical-conditioning'), 'stimulus'],
  ['t-dns', 'technology', 'DNS', 'MDN', 'https://developer.mozilla.org/en-US/docs/Glossary/DNS', 'IP address'],
  ['t-http', 'technology', 'Overview of HTTP', 'MDN', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview', 'stateless'],
  ['t-cache', 'technology', 'HTTP caching', 'MDN', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching', 'stores'],
  ['t-tls', 'technology', 'Transport Layer Security', 'MDN', 'https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Transport_Layer_Security', 'TLS'],
  ['t-cookie', 'technology', 'Using HTTP cookies', 'MDN', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies', 'session'],
].map(([id, domain, title, publisher, url, focus]) => ({ id, domain, title, publisher, url, focus, scope: domains.find(d => d.id === domain).keywords }));

export const topicCoverage = {
  's-map': ['地图', '地图投影', '墨卡托', '面积失真'], 's-sky': ['彩虹', '光的色散', '棱镜'], 's-season': ['季节', '地轴倾角'],
  's-gravity': ['引力', '万有引力'], 's-moon': ['月亮', '月球', '月相'], 'l-cell': ['细胞', '线粒体'], 'l-osmosis': ['渗透', '半透膜'],
  'l-enzyme': ['酶', '活化能', '催化'], 'l-dna': ['DNA', '遗传密码', '密码子'], 'l-evolution': ['进化', '自然选择'],
  'h-agriculture': ['农业', '新石器革命'], 'h-cities': ['城市', '早期文明', '农业剩余', '社会分工'], 'h-trade': ['撒哈拉贸易', '绿洲', '贸易网络'],
  'h-industry': ['工业革命', '第二次工业革命', '电气化'], 'h-evidence': ['历史证据', '历史因果', '历史解释'],
  'e-cost': ['机会成本', '稀缺'], 'e-demand': ['供需', '需求量', '市场均衡'], 'e-trade': ['比较优势', '绝对优势', '分工'],
  'e-public': ['公共品', '非排他性'], 'e-inflation': ['通胀', '通货膨胀', '消费篮子'],
  'p-memory': ['记忆', '语义编码'], 'p-recall': ['记忆练习', '复述', '提取练习'], 'p-bias': ['确认偏误', '认知偏差'],
  'p-cause': ['相关与因果', '第三变量'], 'p-learning': ['经典条件作用', '条件反射'],
  't-dns': ['DNS', '域名解析', 'IP地址'], 't-http': ['HTTP', '网络请求', '无状态'], 't-cache': ['浏览器缓存', 'HTTP缓存'],
  't-tls': ['TLS', '网络加密', 'HTTPS'], 't-cookie': ['Cookie', '会话', '购物车'],
};

export function sourcesForTopic(topic) {
  const needle = topic.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu, '');
  return Object.entries(topicCoverage).filter(([, aliases]) => aliases.some(alias => {
    const normalized = alias.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu, '');
    return needle.includes(normalized) || normalized.includes(needle);
  })).map(([id]) => id);
}
