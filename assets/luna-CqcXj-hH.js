import{r as n,j as e}from"./vendor-react-EfbF1ROp.js";import{u as E,w as T,L as z,aL as C,aM as O,Q as $,aN as A,j as M}from"./index-Dbe8ZzPa.js";const P=`你是 LunaSol 的包装设计助手 Luna，一个有审美、懂印刷工艺的设计师。你的工作是通过对话，帮用户把包装需求从模糊聊到具体。

规则：
1. 每次只问 1-2 个问题，不要一次轰炸。先问最关键的：做什么产品、品牌叫什么、想要什么感觉（风格）。
2. 只聊包装设计相关话题：产品、品牌、风格、材质、工艺、尺寸、目标人群、使用场景。聊跑题时温和拉回："这个我们先聊完包装再展开？"
3. 信息尽量具体：产品是什么、品牌名、风格（极简/东方/复古/自然/插画/轻奢）、材质（纸/铁/玻璃/塑料/木）、尺寸（长宽高 mm）、目标人群。
4. 用户主动描述时，先复述确认，再补问缺失项。
5. 回复用中文，口语化，像设计师在聊天，不要列点，不要用 Markdown 标题。
6. 不要提"你将进入工作台"之类的元话；你只负责聊设计。`,R=m=>`下面是用户和包装设计助手 Luna 的对话。请从中提取设计关键信息，返回 JSON，字段如下：
- product: 产品名称（如"桂花乌龙茶"）
- brand: 品牌名（如"山野集"）
- style: 风格（现代极简/现代东方/复古怀旧/自然有机/潮流插画/轻奢商业 之一，不确定留空）
- material: 材质（如 白卡纸/铁盒/玻璃瓶/牛皮纸）
- size: 尺寸描述原文（如"200x150x80mm"）
- audience: 目标人群
- scene: 使用场景
- tagline: 品牌 slogan 或产品卖点
- colors: 配色倾向（如 米白/墨绿）

只返回 JSON，没有的字段返回空字符串。对话：
${m.map(t=>`${t.role==="user"?"用户":"Luna"}：${t.text}`).join(`
`)}`,u=[{key:"product",label:"产品"},{key:"brand",label:"品牌"},{key:"style",label:"风格"},{key:"material",label:"材质"},{key:"size",label:"尺寸"}];function J(){const{patchBrief:m,setToast:t,update:D}=E(),N=T(),[f,x]=n.useState(!1),[i,p]=n.useState([]),[g,j]=n.useState(""),[c,b]=n.useState(!1),[a,y]=n.useState({product:"",brand:"",style:"",material:"",size:"",audience:"",scene:"",tagline:"",colors:""}),h=n.useRef(null);n.useEffect(()=>{i.length===0&&p([{role:"assistant",text:"你好，我是 Luna。我们一起把你的包装聊清楚——先告诉我：你想做什么产品？比如茶叶、咖啡、护肤品、零食，还是别的？"}])},[]),n.useEffect(()=>{h.current?.scrollTo({top:h.current.scrollHeight,behavior:"smooth"})},[i,c]);const o=u.filter(s=>a[s.key]).length,v=async()=>{const s=g.trim();if(!s||c)return;j("");const l=[...i,{role:"user",text:s}];p(l),b(!0);try{const d=C(),L=await O([{role:"system",content:P},...l.map(r=>({role:r.role,content:r.text}))],d);p(r=>[...r,{role:"assistant",text:L}]),$([{role:"user",content:R(l)}],d).then(r=>y(S=>({...S,...Object.fromEntries(Object.entries(r).filter(([,w])=>w))}))).catch(()=>{})}catch(d){t(d.message||"AI 暂时连不上")}finally{b(!1)}},k=()=>{const s=A(a.size);m({product:a.product,brand:a.brand,style:a.style,material:a.material,audience:a.audience,scene:a.scene,tagline:a.tagline,raw:i.map(l=>`${l.role==="user"?"我":"Luna"}：${l.text}`),...s?{size:s}:{}}),t(`已填入 ${o}/5 项关键信息，进入设计流程`),M("/wizard")};return N.user?e.jsxs("div",{className:"luna-page",children:[e.jsxs("div",{className:"luna-chat",ref:h,children:[i.map((s,l)=>e.jsxs("div",{className:`luna-msg ${s.role}`,children:[s.role==="assistant"&&e.jsx("div",{className:"luna-avatar",children:"L"}),e.jsx("div",{className:"luna-bubble",children:s.text})]},l)),c&&e.jsxs("div",{className:"luna-msg assistant",children:[e.jsx("div",{className:"luna-avatar",children:"L"}),e.jsx("div",{className:"luna-bubble luna-typing",children:"正在输入…"})]})]}),e.jsxs("div",{className:"luna-input-bar",children:[e.jsxs("div",{className:"luna-progress",children:[e.jsxs("div",{className:"luna-progress-label",children:["关键信息 ",o,"/",u.length]}),e.jsx("div",{className:"luna-progress-track",children:e.jsx("div",{className:"luna-progress-fill",style:{width:`${o/u.length*100}%`}})}),e.jsx("div",{className:"luna-progress-fields",children:u.map(s=>e.jsx("span",{className:a[s.key]?"done":"",children:s.label},s.key))})]}),e.jsxs("div",{className:"luna-input-row",children:[e.jsx("input",{className:"luna-input",value:g,onChange:s=>j(s.target.value),onKeyDown:s=>{s.key==="Enter"&&v()},placeholder:"告诉 Luna 你的想法，或者直接问她…"}),e.jsx("button",{className:"v4-btn-line",disabled:c,onClick:()=>void v(),children:c?"…":"发送"}),e.jsx("button",{className:"v4-btn-dark",disabled:o<1,onClick:k,children:"进入工作台 →"})]}),e.jsxs("div",{className:"luna-model-row",children:[e.jsx("span",{className:"luna-model-label",children:"模型："}),e.jsxs("select",{className:"luna-model-select",value:"deepseek",onChange:()=>t("GPT 接入后可在此切换"),children:[e.jsx("option",{value:"deepseek",children:"DeepSeek（deepseek-chat）"}),e.jsx("option",{value:"gpt",disabled:!0,children:"GPT（即将接入）"})]})]})]})]}):e.jsxs("div",{className:"page page-narrow",children:[e.jsxs("div",{style:{textAlign:"center",paddingTop:80},children:[e.jsx("h1",{style:{fontSize:32,marginBottom:12},children:"先登录，再和 Luna 聊设计"}),e.jsx("p",{style:{color:"#888",marginBottom:24},children:"对话会保存你的需求、记录 AI 额度。"}),e.jsx("button",{className:"v4-btn-dark",onClick:()=>x(!0),children:"登录 / 注册"})]}),e.jsx(z,{open:f,onClose:()=>x(!1),onDone:s=>t(s)})]})}export{J as default};
