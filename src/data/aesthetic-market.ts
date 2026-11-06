/* ============================================================
 * 审美市场数据（真实收录，可溯源）
 * ------------------------------------------------------------
 * 规则（不可违反）：
 *   1. 每条都必须有真实出处：站点给官方链接，作品给原文链接 + 来源站；
 *   2. 作品封面使用来源站提供的图片外链（不复制进本仓库），并保留来源署名；
 *   3. lastVerifiedAt 是「最近一次确认链接可访问」的日期，不是创建日期；
 *   4. 不虚构项目、不虚构品牌、不编造设计分析。
 *
 * 本次核实：2026-11-06。站点 16 个，首页均实测可访问；
 * 作品 34 条，来自 BP&O 公开 RSS（当期真实案例，含原文链接与发布日期）。
 * 更新方式：node scripts/gen-market-data.mjs（读 scripts/market-source.json 重新生成）。
 * ============================================================ */

export type MarketCategory =
  | '包装设计' | '品牌设计' | '平面设计' | '产品摄影'
  | '东方美学' | '极简主义' | '字体排版' | '色彩与图形' | '创意实验';

export interface MarketSite {
  id: string;
  title: string;
  domain: string;
  officialUrl: string;
  description: string;
  country?: string;
  categories: MarketCategory[];
  tags: string[];
  coverImage?: string;
  designNotes: string[];
  why: string;
  sourceCredit: string;
  lastVerifiedAt: string;
}

export interface MarketWork {
  id: string;
  title: string;
  brand: string;
  image: string;
  category: MarketCategory;
  styleTags: string[];
  description: string;
  sourceUrl: string;
  sourceSiteId: string;
  sourceCredit: string;
  publishedAt: string;
  lastVerifiedAt: string;
}

export const MARKET_SITES: MarketSite[] = [
  {
    "id": "bpando",
    "title": "BP&O",
    "domain": "bpando.org",
    "officialUrl": "https://bpando.org/",
    "country": "英国",
    "description": "由 Richard Baird 主笔的品牌与包装评论站。它不只展示作品，而是逐个项目分析策略、字体、材质与印刷工艺的取舍。",
    "categories": [
      "包装设计",
      "品牌设计"
    ],
    "tags": [
      "包装评论",
      "品牌策略",
      "工艺细节"
    ],
    "designNotes": [
      "看它如何用「为什么这样做」解释视觉，而不是只贴图",
      "注意同一品牌在不同品类里的延展逻辑",
      "留意 Pantone 与材质在实拍中的真实呈现"
    ],
    "why": "最适合「想弄明白好包装为什么好」的人：这里是评论，不是图库。",
    "coverImage": "",
    "sourceCredit": "BP&O",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "brandnew",
    "title": "Brand New",
    "domain": "underconsideration.com",
    "officialUrl": "https://www.underconsideration.com/brandnew/",
    "country": "美国",
    "description": "UnderConsideration 旗下的品牌重设计评论栏目，以犀利的「before / after」对照和评分著称。",
    "categories": [
      "品牌设计"
    ],
    "tags": [
      "品牌重设计",
      "标志",
      "评分"
    ],
    "designNotes": [
      "重点看 before/after 的对照逻辑",
      "注意评分为何给低分：常常是「辨识度被磨平」"
    ],
    "why": "判断一个标志改动是否成立，看这里的评审意见最省时间。",
    "coverImage": "",
    "sourceCredit": "UnderConsideration",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "thedieline",
    "title": "The Dieline",
    "domain": "thedieline.com",
    "officialUrl": "https://thedieline.com/",
    "country": "美国",
    "description": "专注包装设计的垂直媒体，覆盖食品、饮料、美妆与奢侈品的上市包装，含大量结构细节图。",
    "categories": [
      "包装设计"
    ],
    "tags": [
      "上市包装",
      "结构",
      "货架表现"
    ],
    "designNotes": [
      "看正面信息层级：品牌名 / 品类 / 卖点各占多少",
      "注意货架尺度下的可读性",
      "留意开窗、烫金、压纹等工艺如何被拍摄出来"
    ],
    "why": "想知道某个品类当下在货架上长什么样，这里更新最快。",
    "coverImage": "",
    "sourceCredit": "The Dieline",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "itsnicethat",
    "title": "It's Nice That",
    "domain": "itsnicethat.com",
    "officialUrl": "https://www.itsnicethat.com/",
    "country": "英国",
    "description": "伦敦的创意产业媒体，覆盖平面、插画、摄影、字体与独立工作室访谈，编辑视角偏「人」而非「货」。",
    "categories": [
      "平面设计",
      "创意实验",
      "字体排版"
    ],
    "tags": [
      "独立工作室",
      "访谈",
      "插画"
    ],
    "designNotes": [
      "看小工作室如何用有限预算做出高完成度",
      "注意插画与版式的配合方式"
    ],
    "why": "找「不那么商业但很有品」的方向时，这里的密度最高。",
    "coverImage": "",
    "sourceCredit": "It's Nice That",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "awwwards",
    "title": "Awwwards",
    "domain": "awwwards.com",
    "officialUrl": "https://www.awwwards.com/",
    "country": "西班牙",
    "description": "全球网页设计评奖站，Site of the Day 由评审团逐日评选，可作为「数字品牌如何呈现」的参考。",
    "categories": [
      "品牌设计",
      "创意实验"
    ],
    "tags": [
      "网页设计",
      "动效",
      "评审"
    ],
    "designNotes": [
      "看高端品牌官网如何组织首屏与留白",
      "注意动效服务于信息还是喧宾夺主"
    ],
    "why": "做包装品牌官网、落地页时，这里是现成的行业水位线。",
    "coverImage": "",
    "sourceCredit": "Awwwards",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "pentagram",
    "title": "Pentagram",
    "domain": "pentagram.com",
    "officialUrl": "https://www.pentagram.com/",
    "country": "英国 / 美国",
    "description": "全球最大的独立设计事务所，合伙人制，项目覆盖品牌识别、包装、出版与空间。",
    "categories": [
      "品牌设计",
      "包装设计",
      "平面设计"
    ],
    "tags": [
      "设计事务所",
      "品牌系统",
      "出版"
    ],
    "designNotes": [
      "重点看系统如何落地到多品类",
      "注意网格与字体的纪律性"
    ],
    "why": "想理解「一个品牌如何被做成一套系统」，看它的项目档案最直接。",
    "coverImage": "https://www.pentagram.com/pentagram_social.png",
    "sourceCredit": "Pentagram",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "further",
    "title": "Further（原 DesignStudio）",
    "domain": "design.studio",
    "officialUrl": "https://design.studio/",
    "country": "英国",
    "description": "伦敦品牌设计工作室，2026 年更名为 Further。作品以强烈的单一概念与大胆字标著称。",
    "categories": [
      "品牌设计",
      "包装设计"
    ],
    "tags": [
      "概念驱动",
      "字标",
      "品牌重塑"
    ],
    "designNotes": [
      "看它如何把一个概念压缩成一个可复用的图形",
      "注意色彩克制到什么程度"
    ],
    "why": "适合找「一句话就能说清的品牌」参考。",
    "coverImage": "",
    "sourceCredit": "Further / DesignStudio",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "bedow",
    "title": "Bedow",
    "domain": "bedow.se",
    "officialUrl": "https://bedow.se/",
    "country": "瑞典",
    "description": "斯德哥尔摩的品牌与包装工作室，北欧式克制，擅长纸张、专色与工艺的组合。",
    "categories": [
      "包装设计",
      "品牌设计",
      "极简主义"
    ],
    "tags": [
      "北欧",
      "纸张",
      "专色"
    ],
    "designNotes": [
      "看低饱和配色如何靠材质撑起质感",
      "注意留白比例与信息密度"
    ],
    "why": "做「高级但安静」的包装，这是最值得反复看的档案。",
    "coverImage": "https://a.storyblok.com/f/69091/1200x630/a9c892d3c7/bedow.jpg",
    "sourceCredit": "Bedow",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "fontsinuse",
    "title": "Fonts In Use",
    "domain": "fontsinuse.com",
    "officialUrl": "https://fontsinuse.com/",
    "country": "美国",
    "description": "字体使用档案库，按字体反查真实应用场景，每条都标注具体字体、厂商与出处。",
    "categories": [
      "字体排版",
      "平面设计"
    ],
    "tags": [
      "字体档案",
      "排版",
      "可溯源"
    ],
    "designNotes": [
      "按字体反查：同一款字在包装与出版里的不同处理",
      "注意字号、字距、行距的真实参数"
    ],
    "why": "解决「这个包装用的是什么字体」这类具体问题。",
    "coverImage": "",
    "sourceCredit": "Fonts In Use",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "typewolf",
    "title": "Typewolf",
    "domain": "typewolf.com",
    "officialUrl": "https://www.typewolf.com/",
    "country": "美国",
    "description": "字体搭配与趋势推荐站，按气质分类给出可执行的字体组合，含免费替代方案。",
    "categories": [
      "字体排版",
      "极简主义"
    ],
    "tags": [
      "字体搭配",
      "趋势",
      "替代方案"
    ],
    "designNotes": [
      "看一套搭配里衬线/无衬线如何分工",
      "注意字重层级只有 2–3 级时的高级感"
    ],
    "why": "不会选字体时，从这里挑一组搭配直接套用。",
    "coverImage": "https://www.typewolf.com/assets/img/typewolf-og.png",
    "sourceCredit": "Typewolf",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "lovelypackage",
    "title": "Lovely Package",
    "domain": "lovelypackage.com",
    "officialUrl": "https://lovelypackage.com/",
    "country": "",
    "description": "包装设计灵感站，以视觉优先的方式聚合新品包装与设计案例。",
    "categories": [
      "包装设计"
    ],
    "tags": [
      "包装",
      "灵感",
      "新品"
    ],
    "designNotes": [
      "快速扫货架级视觉方向",
      "注意同一品类的色彩惯性"
    ],
    "why": "先建立「这个品类大概长什么样」的直觉，再决定要不要反着做。",
    "coverImage": "",
    "sourceCredit": "Lovely Package",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "pentawards",
    "title": "Pentawards",
    "domain": "pentawards.com",
    "officialUrl": "https://www.pentawards.com/",
    "country": "英国（全球奖项）",
    "description": "全球包装设计奖项，年度获奖作品按品类与设计维度分类，评委构成跨品牌方与设计机构。",
    "categories": [
      "包装设计"
    ],
    "tags": [
      "获奖作品",
      "品类标杆",
      "评审标准"
    ],
    "designNotes": [
      "按品类看年度标杆，比随机刷图更有效",
      "注意获奖理由里反复出现的关键词"
    ],
    "why": "想知道「今年什么算好包装」，看获奖名单最快。",
    "coverImage": "",
    "sourceCredit": "Pentawards",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "zcool",
    "title": "站酷 ZCOOL",
    "domain": "zcool.com.cn",
    "officialUrl": "https://www.zcool.com.cn/",
    "country": "中国",
    "description": "中国设计师社区与作品平台，覆盖品牌、包装、插画与电商视觉，中文语境下的商业设计样本量大。",
    "categories": [
      "品牌设计",
      "平面设计",
      "东方美学"
    ],
    "tags": [
      "中文排版",
      "商业设计",
      "本土品牌"
    ],
    "designNotes": [
      "看中文标题字与拉丁字如何混排",
      "注意国内货架与电商场景的差异"
    ],
    "why": "做面向中国市场的包装，这里的语境最贴近。",
    "coverImage": "",
    "sourceCredit": "站酷 ZCOOL",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "topys",
    "title": "TOPYS",
    "domain": "topys.cn",
    "officialUrl": "https://www.topys.cn/",
    "country": "中国",
    "description": "创意内容平台，偏「观点与案例解读」，覆盖品牌、广告、设计与文化议题。",
    "categories": [
      "品牌设计",
      "创意实验",
      "东方美学"
    ],
    "tags": [
      "创意观点",
      "案例解读",
      "文化"
    ],
    "designNotes": [
      "看它如何把文化母题翻译成视觉语言",
      "注意文案与视觉的同构关系"
    ],
    "why": "找「东方现代」这类气质时，比纯图库更有解释力。",
    "coverImage": "",
    "sourceCredit": "TOPYS",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "gtn9",
    "title": "古田路9号",
    "domain": "gtn9.com",
    "officialUrl": "https://www.gtn9.com/",
    "country": "中国",
    "description": "中国品牌与包装设计平台，作品以商业落地项目为主，含大量食品、茶叶、酒类包装。",
    "categories": [
      "包装设计",
      "东方美学",
      "品牌设计"
    ],
    "tags": [
      "食品包装",
      "茶叶",
      "酒类",
      "国潮"
    ],
    "designNotes": [
      "看传统纹样如何被简化到可印刷的程度",
      "注意烫金/UV 在深色纸上的表现"
    ],
    "why": "做中式食品、茶叶、酒类包装时，这里的参照最对味。",
    "coverImage": "",
    "sourceCredit": "古田路9号",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "dezeen",
    "title": "Dezeen",
    "domain": "dezeen.com",
    "officialUrl": "https://www.dezeen.com/",
    "country": "英国",
    "description": "建筑与设计媒体，覆盖产品、材料与包装相关的工业设计议题，图片质量高。",
    "categories": [
      "产品摄影",
      "平面设计",
      "极简主义"
    ],
    "tags": [
      "工业设计",
      "材料",
      "摄影"
    ],
    "designNotes": [
      "看产品摄影如何交代材质与尺度",
      "注意留白与背景色的选择"
    ],
    "why": "需要高品质产品图与材质参考时可用。",
    "coverImage": "",
    "sourceCredit": "Dezeen",
    "lastVerifiedAt": "2026-11-06"
  }
];

export const MARKET_WORKS: MarketWork[] = [
  {
    "id": "w01-mother-design-pilfers-from-y2k-aesthetics-and-cymati",
    "title": "Mother Design pilfers from Y2K aesthetics and cymatic patterns in its masterful identity for s…",
    "brand": "",
    "image": "https://bpando.org/wp-content/uploads/purple-garden-mother-design-branding-identity-design-bpo-review-video1.png",
    "category": "品牌设计",
    "styleTags": [
      "品牌设计"
    ],
    "description": "Mother Design really has been getting spiritual lately. I suppose, in a way, it always has been: after all, what’s really more spiritual than the co…",
    "sourceUrl": "https://bpando.org/2026/11/05/mother-design-brand-identity-spirituality-app-purple-garden/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-11-05",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w02-tied-with-care",
    "title": "Tied With Care",
    "brand": "",
    "image": "https://bpando.org/wp-content/uploads/julia-hey-ribbon-wordmark-1024x572.jpg",
    "category": "包装设计",
    "styleTags": [
      "包装设计"
    ],
    "description": "Packaging expert Lisa Cain shares her opinion on Hey’s visual identity for Barcelona speciality coffee shop Julia. The post Tied With Care appeared …",
    "sourceUrl": "https://bpando.org/2026/11/04/tied-with-care/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-11-04",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w03-ragged-edge-creates-a-playful-new-identity-for-middl",
    "title": "Ragged Edge creates a playful new identity for Middle Eastern fintech app Tabby",
    "brand": "",
    "image": "https://bpando.org/wp-content/uploads/ragged-edge-tabby-brandng-identity-design-bpo-review-logo-mark-badge-1024x614.png",
    "category": "品牌设计",
    "styleTags": [
      "品牌设计"
    ],
    "description": "Tabby is a Middle East-born fintech app, founded by Hosam Arab and Daniil Barkalov in 2019 and now billed as “the money app that lets you spend, sen…",
    "sourceUrl": "https://bpando.org/2026/11/03/ragged-edge-tabby-branding-identity-design/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-11-03",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w04-dutchscot-brings-a-beautifully-nuanced-take-on-paris",
    "title": "Dutchscot brings a beautifully nuanced take on Parisian Belle Époque glamour to Brooklyn’s Bar…",
    "brand": "Dutchscot",
    "image": "https://bpando.org/wp-content/uploads/bar-reve-dutchscot-branding-identity-design-bpo-review-monongram-1024x576.jpeg",
    "category": "品牌设计",
    "styleTags": [
      "品牌设计"
    ],
    "description": "There’s been a slew of really excellent work for food, booze and hospitality gracing BP&O lately, and this new project from Dutchscot certainly isn’…",
    "sourceUrl": "https://bpando.org/2026/10/29/dutchscot-bar-reve-brooklyn-cocktail-brand-identity-belle-epoque/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-10-29",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w05-forbidden-fruit",
    "title": "Forbidden Fruit",
    "brand": "",
    "image": "https://bpando.org/wp-content/uploads/aVlBKHNYClf9owFK_aUEvkXNYClf9oPuC_CASSETTA_PERE_02-1024x618.jpg",
    "category": "包装设计",
    "styleTags": [
      "包装设计"
    ],
    "description": "Packaging expert Lisa Cain shares her opinion on AUGE’s packaging and visual identity for apple brand Eden Gold. The post Forbidden Fruit appeared f…",
    "sourceUrl": "https://bpando.org/2026/10/28/forbidden-fruit/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-10-28",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w06-andstudio-s-identity-for-new-rotterdam-bar-werf-is-a",
    "title": "andstudio’s identity for new Rotterdam bar Werf is a brilliant lesson in graphic simplicity an…",
    "brand": "andstudio",
    "image": "https://bpando.org/wp-content/uploads/werf-andstudio-brand-identity-design-bpo-review-logo-1024x576.avif",
    "category": "品牌设计",
    "styleTags": [
      "品牌设计"
    ],
    "description": "Werf is a new Rotterdam-based bar and bistro housed directly inside the Stadswerf Koningspoort, a fully operational historic shipyard. The name simp…",
    "sourceUrl": "https://bpando.org/2026/10/27/andstudio-werf-rotterdam-bar-identity-design/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-10-27",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w07-pentagram-looks-to-grand-central-oyster-bar-s-iconic",
    "title": "Pentagram looks to Grand Central Oyster Bar’s iconic lettering for its gorgeously gaudy Storef…",
    "brand": "Pentagram",
    "image": "https://bpando.org/wp-content/uploads/storefront-gala-2026-pentagram-identity-logo-wordmark-bpo-review-mainn-1024x577.avif",
    "category": "字体排版",
    "styleTags": [
      "字体排版"
    ],
    "description": "Storefront for Art and Architecture is a Manhattan, New York-based non-profit organisation that aims to explore the relationship between architectur…",
    "sourceUrl": "https://bpando.org/2026/10/22/pentagram-new-york-storefront-gala-2026-event-identity-design/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-10-22",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w08-fresh-out-of-history",
    "title": "Fresh Out of History",
    "brand": "",
    "image": "https://bpando.org/wp-content/uploads/fSPeKBURcljJmEmThCKNJYf42Q.png-1024x585.webp",
    "category": "包装设计",
    "styleTags": [
      "包装设计"
    ],
    "description": "Packaging expert Lisa Cain shares her opinion on ChoChoi’s packaging and visual identity for coconut sparkling water brand Above Water. The post Fre…",
    "sourceUrl": "https://bpando.org/2026/10/21/fresh-out-of-history/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-10-21",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w09-caserne-eschews-worthy-sentimentality-in-its-gorgeou",
    "title": "Caserne eschews worthy sentimentality in its gorgeously vibrant, unapologetically modern ident…",
    "brand": "Caserne",
    "image": "https://bpando.org/wp-content/uploads/caserne-lets-grow-canada-branding-identity-design-logo-bpo-review-stickers-1024x576.jpg",
    "category": "品牌设计",
    "styleTags": [
      "品牌设计"
    ],
    "description": "It’s a rare delight to come across a brand identity project where I can honestly say I love everything about it – from the name to the logo, applica…",
    "sourceUrl": "https://bpando.org/2026/10/20/caserne-brand-identity-design-lets-grow-canada/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-10-20",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w10-dnco-creates-vermont-s-first-dedicated-consumer-tour",
    "title": "DNCO creates Vermont’s first dedicated consumer tourism brand, aiming to “turn affection into …",
    "brand": "DNCO creates Vermont",
    "image": "https://bpando.org/wp-content/uploads/vermont-dnco-logo-bpo-review--1024x683.jpeg",
    "category": "品牌设计",
    "styleTags": [
      "品牌设计"
    ],
    "description": "I’m sure I can’t be alone as someone (albeit someone from England) who would be utterly incapable of pointing to the whereabouts of Vermont on a map…",
    "sourceUrl": "https://bpando.org/2026/10/15/dnco-vermont-state-tourism-brand-identity/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-10-15",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w11-all-purpose-s-identity-for-two-tribes-brewing-is-res",
    "title": "All Purpose’s identity for Two Tribes Brewing is resolutely ‘craft’, while also turning its ba…",
    "brand": "All Purpose",
    "image": "https://bpando.org/wp-content/uploads/two-tribes-all-purpose-brand-identity-design-logo-packaging-bpo-review-wordmark-1024x535.jpeg",
    "category": "包装设计",
    "styleTags": [
      "包装设计"
    ],
    "description": "Founded in 2017 by veterans of London’s 1990s club scene, craft beer company Two Tribes is based at Tileyard in King’s Cross, where its brewery and …",
    "sourceUrl": "https://bpando.org/2026/10/08/two-tribes-brewing-all-purpose-brand-identity-design-logo-packaging/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-10-08",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w12-pizza-with-a-side-of-therapy",
    "title": "Pizza With A Side Of Therapy",
    "brand": "",
    "image": "https://bpando.org/wp-content/uploads/Screenshot-2026-10-06-at-15.38.20-1024x1024.png",
    "category": "包装设计",
    "styleTags": [
      "包装设计"
    ],
    "description": "Packaging expert Lisa Cain shares her opinion on Pentagram’s visual identity for pizza place Parla. The post Pizza With A Side Of Therapy appeared f…",
    "sourceUrl": "https://bpando.org/2026/10/07/pizza-with-a-side-of-therapy/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-10-07",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w13-koto-s-new-branding-for-restaurant-discovery-app-fra",
    "title": "Koto’s new branding for restaurant discovery app Franki feels lively, thoroughly human, and ju…",
    "brand": "Koto",
    "image": "https://bpando.org/wp-content/uploads/koto-franki-brand-design-wordmark-bpo-review-1024x576.png",
    "category": "包装设计",
    "styleTags": [
      "包装设计"
    ],
    "description": "Franki is an app for restaurants: people that like to visit them, and people who run them. Billed as a “social restaurant discovery and rewards plat…",
    "sourceUrl": "https://bpando.org/2026/10/06/koto-franki-restaurant-app-brand-design/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-10-06",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w14-vrints-kolsteren-s-gorgeous-identity-for-pizza-resta",
    "title": "Vrints-Kolsteren’s gorgeous identity for pizza restaurant Napoli on the Road brings a little m…",
    "brand": "Vrints-Kolsteren",
    "image": "https://bpando.org/wp-content/uploads/Vrints-Kolsteren-NotR-napoli-on-the-road-brand-identity-design-bpo-review-pizza-1-1024x576.png",
    "category": "包装设计",
    "styleTags": [
      "包装设计"
    ],
    "description": "It’s not all that often you come across a project which I’m confident that 99.9% of people couldn’t possibly slate – or at least 99.9% of people wit…",
    "sourceUrl": "https://bpando.org/2026/10/01/vrints-kolsteren-napoli-on-the-road-pizza-restaurant-brand-identity-design/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-10-01",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w15-playing-with-your-food",
    "title": "Playing With Your Food",
    "brand": "",
    "image": "https://bpando.org/wp-content/uploads/Wide-1-scaled-1-1024x583.jpg",
    "category": "包装设计",
    "styleTags": [
      "包装设计"
    ],
    "description": "Packaging expert Lisa Cain shares her opinion on Center’s branding for meal company Riff. The post Playing With Your Food appeared first on BP&O - B…",
    "sourceUrl": "https://bpando.org/2026/09/30/playing-with-your-food/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-09-30",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w16-jkr-s-tropical-smoothie-cafe-rebrand-is-deliciously-",
    "title": "JKR’s Tropical Smoothie Cafe rebrand is deliciously on the nose, and all the better for it",
    "brand": "JKR",
    "image": "https://bpando.org/wp-content/uploads/JKR-Tropical-Smoothie-Cafe-brand-identity-design-BPO-review-logo-icon-sign-1024x576.jpeg",
    "category": "品牌设计",
    "styleTags": [
      "品牌设计"
    ],
    "description": "“If it ain’t broke, don’t fix it” is a phrase bandied about a fair bit across all facets of existence, but in some cases, that sentiment really does…",
    "sourceUrl": "https://bpando.org/2026/09/29/jkr-tropical-smoothie-cafe-brand-identity/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-09-29",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w17-ragged-edge-creates-refreshingly-wholesome-identity-",
    "title": "Ragged Edge creates refreshingly wholesome identity for AI notepad Granola",
    "brand": "",
    "image": "https://bpando.org/wp-content/uploads/Granola-Ragged-Edge-branding-identity-design-BPO-review-logo-1024x576.png",
    "category": "包装设计",
    "styleTags": [
      "包装设计"
    ],
    "description": "Granola is a brand that’s certainly made itself known in recent months – at least to those using various lines on the London Underground. Indeed, th…",
    "sourceUrl": "https://bpando.org/2026/09/25/ragged-edge-branding-identity-design-granola/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-09-25",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w18-some-names-just-sound-thick",
    "title": "Some Names Just Sound Thick",
    "brand": "",
    "image": "https://bpando.org/wp-content/uploads/bouf_case-study_06.jpg-1024x651.webp",
    "category": "包装设计",
    "styleTags": [
      "包装设计"
    ],
    "description": "Packaging expert Lisa Cain reviews Willow & Blake’s visual identity and packaging design for postpartum hair loss brand Bouf. The post Some Names Ju…",
    "sourceUrl": "https://bpando.org/2026/09/23/some-names-just-sound-thick/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-09-23",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w19-pentagram-new-york-s-surprisingly-joyful-brand-ident",
    "title": "Pentagram New York’s surprisingly joyful brand identity for Mozilla editorial platform Nothing…",
    "brand": "Pentagram New York",
    "image": "https://bpando.org/wp-content/uploads/NothingPersonal-Pentagram-brand-identity-design-bpo-review-logo-wordmark.png-1024x577.jpeg",
    "category": "品牌设计",
    "styleTags": [
      "品牌设计"
    ],
    "description": "If you’ve heard of Mozilla, it’s probably thanks to Firefox, the search engine perhaps most famous for its dedication to the more utopian ideals of …",
    "sourceUrl": "https://bpando.org/2026/09/22/nothing-personal-magazine-design-pentagram-brand-identity/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-09-22",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w20-wedge-s-bast-t-toothpaste-brand-design-makes-absolut",
    "title": "Wedge’s Bastét toothpaste brand design makes absolutely no sense for its category – and perhap…",
    "brand": "Wedge",
    "image": "https://bpando.org/wp-content/uploads/bastet-wedge-branding-identity-design-logo-wordmark-bpo-review-1024x683.webp",
    "category": "包装设计",
    "styleTags": [
      "包装设计"
    ],
    "description": "“Nano-hydroxyapatite” isn’t exactly memorable – it takes a few tries to even attempt to figure out how to say it, and I’d wager that there aren’t to…",
    "sourceUrl": "https://bpando.org/2026/09/18/wedge-bastet-toothpaste-brand-identity-packaging-design/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-09-18",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w21-design-that-stirs",
    "title": "Design That Stirs",
    "brand": "",
    "image": "https://bpando.org/wp-content/uploads/5c5d728293fb0e25216035d95336a37b5575f781-9167x6667-1-1024x745.jpg",
    "category": "包装设计",
    "styleTags": [
      "包装设计"
    ],
    "description": "Packaging expert Lisa Cain reviews A Friend Of Mine’s work for The Cocktail Cabinet’s recipe card packs for home bars and cocktail lovers. The post …",
    "sourceUrl": "https://bpando.org/2026/09/16/design-that-stirs/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-09-16",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w22-mother-design-gives-psychic-platform-keen-a-90s-new-",
    "title": "Mother Design gives psychic platform Keen a 90s New Age sensibility for the digital age – and …",
    "brand": "",
    "image": "https://bpando.org/wp-content/uploads/mother-design-keen-brand-identity-design-logo-bpo-review-wordmark-1024x683.png",
    "category": "品牌设计",
    "styleTags": [
      "品牌设计"
    ],
    "description": "Arguably, we’re approaching a time that could be seen to be ‘post-woo-woo’ – as in, those things that have long been dismissed as daft; the preserve…",
    "sourceUrl": "https://bpando.org/2026/09/15/mother-design-gives-psychic-platform-keen-a-90s-new-age-sensibility-for-the-digital-age-and-it-works-beautifully/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-09-15",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w23-studio-south-merges-rigour-and-ridiculousness-in-the",
    "title": "Studio South merges rigour and ridiculousness in the best way possible in its superb identity …",
    "brand": "",
    "image": "https://bpando.org/wp-content/uploads/Studio-South-Oodles-branding-packaging-identity-design-bpo-review-chopsticks--1024x726.jpg",
    "category": "品牌设计",
    "styleTags": [
      "品牌设计"
    ],
    "description": "There’s so much to love about this identity – not least that it manages to make a noodle joint look like a perennially hip skate brand (yes, I am ob…",
    "sourceUrl": "https://bpando.org/2026/09/10/oodles-noodles-restaurant-auckland-new-zealand-brand-identity-design-by-studio-south/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-09-10",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w24-oral-care-shelves-where-good-design-usually-goes-to-",
    "title": "Oral Care Shelves…Where Good Design Usually Goes To Die",
    "brand": "",
    "image": "https://bpando.org/wp-content/uploads/smartlife-dental-cpg-floss-pick-toothbrush-packaging-design_921945a664edda60bad00249f79660b7-1024x611.jpg",
    "category": "包装设计",
    "styleTags": [
      "包装设计"
    ],
    "description": "Packaging expert Lisa Cain shares her opinion on oral hygiene brand Smart Life The post Oral Care Shelves…Where Good Design Usually Goes To Die appe…",
    "sourceUrl": "https://bpando.org/2026/09/09/oral-care-shelves-where-good-design-usually-goes-to-die/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-09-09",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w25-mucca-makes-new-york-supermarket-company-fairway-s-e",
    "title": "Mucca makes New York supermarket company Fairway’s everyday essentials anything but basic",
    "brand": "Mucca",
    "image": "https://bpando.org/wp-content/uploads/mucca-fairway-everyday-essentials-branding-packaging-logo-wordmark-bpo-review-seltzer-1024x576.webp",
    "category": "品牌设计",
    "styleTags": [
      "品牌设计"
    ],
    "description": "Founded in 1933, Fairway Market is an independent regional supermarket chain with stores across New York. The grocery retailer sells food and househ…",
    "sourceUrl": "https://bpando.org/2026/09/08/mucca-fairway-everyday-essentials-branding-packaging-logo-wordmark/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-09-08",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w26-i-am-the-walrus-anatomy-s-charming-new-identity-for-",
    "title": "‘I am the walrus’: Anatomy’s charming new identity for the Horniman Museum",
    "brand": "‘I am the walrus’: Anatomy",
    "image": "https://bpando.org/wp-content/uploads/horniman-museum-anatomy-branding-identity-design-bpo-review-flags-1024x635.webp",
    "category": "品牌设计",
    "styleTags": [
      "品牌设计"
    ],
    "description": "I struggle to think of a subculture I detest quite as viscerally and deeply as steampunks: not only is it aesthetically quite hideous, I just don’t …",
    "sourceUrl": "https://bpando.org/2026/09/03/i-am-the-walrus-anatomys-charming-new-identity-for-the-horniman-museum/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-09-03",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w27-packaging-s-dirtiest-job",
    "title": "Packaging’s Dirtiest Job",
    "brand": "Packaging",
    "image": "https://bpando.org/wp-content/uploads/Michu_Wonder_Litter_-_Plant-Based_Automatic-Box_Friendly_2.5kg_6L_2_2048x.jpg-1024x683.webp",
    "category": "包装设计",
    "styleTags": [
      "包装设计"
    ],
    "description": "Packaging expert Lisa Cain shares her opinion on brand Michu’s cat litter range. The post Packaging’s Dirtiest Job appeared first on BP&O - Branding…",
    "sourceUrl": "https://bpando.org/2026/09/02/packagings-dirtiest-job/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-09-02",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w28-thonik-s-identity-for-orkest-phion-gives-the-symphon",
    "title": "Thonik’s identity for Orkest Phion gives the symphony orchestra a brand that’s as ever-changin…",
    "brand": "Thonik",
    "image": "https://bpando.org/wp-content/uploads/phion-orchestra-thonik-branding-identity-design-logo-bpo-review-brochures-1024x683.jpeg",
    "category": "包装设计",
    "styleTags": [
      "包装设计"
    ],
    "description": "Orkest Phion – or Phion Symphony Orchestra in English – is a Dutch travelling symphony orchestra that was formed in 2019 through the merger of the N…",
    "sourceUrl": "https://bpando.org/2026/09/01/orkest-phion-orchestra-thonik-branding-identity-design/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-09-01",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w29-mouthwash-studio-s-identity-for-eyewear-brand-bonnie",
    "title": "Mouthwash Studio’s identity for eyewear brand Bonnie Clyde might be confusing, and infuriating…",
    "brand": "Mouthwash Studio",
    "image": "https://bpando.org/wp-content/uploads/mouthwash-studio-bonnie-clyde-eyewear-logo-wordmark-branding-identity-design-bpo-review-logomark-1024x820.jpg",
    "category": "包装设计",
    "styleTags": [
      "包装设计"
    ],
    "description": "This is an identity that’s not very easy to instantly get your head around – arguably, at a glance, it’s downright confusing. Sometimes it comes on …",
    "sourceUrl": "https://bpando.org/2026/08/27/mouthwash-studio-bonnie-clyde-eyewear-brand-identity/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-08-27",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w30-can-europe-become-a-brand",
    "title": "Can Europe Become a Brand?",
    "brand": "",
    "image": "https://bpando.org/wp-content/uploads/pMnviaitUfdUTAypbDijlcfzdxQ-copy-1024x655.jpg",
    "category": "包装设计",
    "styleTags": [
      "包装设计"
    ],
    "description": "Packaging expert Lisa Cain shares her opinion on the idea of a ‘Made in Europe’ designation for products produced in Europe. The post Can Europe Bec…",
    "sourceUrl": "https://bpando.org/2026/08/26/can-europe-become-a-brand/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-08-26",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w31-studio-blackburn-s-new-identity-for-folding-bike-ico",
    "title": "Studio Blackburn’s new identity for folding bike icon Brompton cements the brand’s place in Br…",
    "brand": "Studio Blackburn",
    "image": "https://bpando.org/wp-content/uploads/Studio-Blackburn-brompton-rebrand-design-identity-logo-wordmark-bpo-review-Brompton-News-1024x683.jpg",
    "category": "品牌设计",
    "styleTags": [
      "品牌设计"
    ],
    "description": "Pretty much the one and only memorable brand name when it comes to bikes you can fold up and carry around, Brompton – as its thoroughly British name…",
    "sourceUrl": "https://bpando.org/2026/08/20/studio-blackburns-new-identity-for-folding-bike-icon-brompton-cements-the-brands-place-in-british-engineering-heritage/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-08-20",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w32-design-scoop",
    "title": "Design Scoop",
    "brand": "",
    "image": "https://bpando.org/wp-content/uploads/MpLyqT1ZHYvI2NzBfNe7QBMtAc-1024x683.jpg",
    "category": "包装设计",
    "styleTags": [
      "包装设计"
    ],
    "description": "Packaging expert Lisa Cain shares her opinion on Bravo’s branding for gelato brand Sweet Cheeks. The post Design Scoop appeared first on BP&O - Bran…",
    "sourceUrl": "https://bpando.org/2026/08/19/design-scoop/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-08-19",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w33-perky-bros-puts-restrained-southern-hospitality-befo",
    "title": "Perky Bros puts restrained Southern hospitality before shouty branding in its identity for Ten…",
    "brand": "",
    "image": "https://bpando.org/wp-content/uploads/PerkyBros-Southall-branding-identity-design-logo-wordmark-bpo-review-Brochure--1024x683.jpg",
    "category": "品牌设计",
    "styleTags": [
      "品牌设计"
    ],
    "description": "Branding parlance often deifies qualities like ‘boldness’ – being ‘brave’, ‘zigging when others zag’, ‘disruption,’ and so on and so forth. Some pro…",
    "sourceUrl": "https://bpando.org/2026/08/18/perky-bros-southern-hospitality-tennessee-resort-southall/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-08-18",
    "lastVerifiedAt": "2026-11-06"
  },
  {
    "id": "w34-porto-rocha-creates-bold-yet-sensitive-new-identity-",
    "title": "Porto Rocha creates bold yet sensitive new identity for Brazilian art gallery Almeida & Dale",
    "brand": "",
    "image": "https://bpando.org/wp-content/uploads/Almeida-Dale-porto-rocha-rebrand-identity-design-wordmark-logo-bpo-review-wordmark-1024x683.jpg",
    "category": "品牌设计",
    "styleTags": [
      "品牌设计"
    ],
    "description": "Founded in São Paulo in 1998, Almeida & Dale is a Brazilian art gallery specialising in modern and contemporary art. Over the past 20 years or so, a…",
    "sourceUrl": "https://bpando.org/2026/08/13/new-brand-identity-design-for-brazilian-art-gallery-almeida-dale-by-porto-rocha-bpo/",
    "sourceSiteId": "bpando",
    "sourceCredit": "BP&O — Brand Packaging & Opinion",
    "publishedAt": "2026-08-13",
    "lastVerifiedAt": "2026-11-06"
  }
];

export const MARKET_CATEGORIES: { id: string; label: MarketCategory | '全部' }[] = [
  { id: 'all', label: '全部' },
  { id: '包装设计', label: '包装设计' },
  { id: '品牌设计', label: '品牌设计' },
  { id: '平面设计', label: '平面设计' },
  { id: '产品摄影', label: '产品摄影' },
  { id: '东方美学', label: '东方美学' },
  { id: '极简主义', label: '极简主义' },
  { id: '字体排版', label: '字体排版' },
  { id: '色彩与图形', label: '色彩与图形' },
  { id: '创意实验', label: '创意实验' },
];

export const MARKET_VERIFIED_AT = '2026-11-06';
