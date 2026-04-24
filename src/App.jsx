import { useState, useMemo, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { db } from "./firebase";
import { doc, setDoc, onSnapshot } from "firebase/firestore";

const GOAL = 3000;
const DOC_ID = "edu-lu";
const COLLECTION = "portfolio";

const TYPE_COLORS = {
  ETF:"#4ade80", Stock:"#60a5fa", Crypto:"#f59e0b", Fixed:"#a78bfa", REIT:"#fb923c",
};

const PRESET_ASSETS = [
  { ticker:"JEPI", name:"JPMorgan Equity Premium Income", type:"ETF",    yield:7.5  },
  { ticker:"SCHD", name:"Schwab US Dividend Equity",      type:"ETF",    yield:3.6  },
  { ticker:"VYM",  name:"Vanguard High Dividend Yield",   type:"ETF",    yield:2.8  },
  { ticker:"VYMI", name:"Vanguard Intl High Dividend",    type:"ETF",    yield:4.0  },
  { ticker:"SPYD", name:"SPDR S&P 500 High Dividend",     type:"ETF",    yield:4.5  },
  { ticker:"SPHD", name:"Invesco S&P 500 High Div",       type:"ETF",    yield:4.0  },
  { ticker:"VNQ",  name:"Vanguard Real Estate ETF",       type:"REIT",   yield:4.5  },
  { ticker:"DGRO", name:"iShares Dividend Growth",        type:"ETF",    yield:2.5  },
  { ticker:"HDV",  name:"iShares High Dividend",          type:"ETF",    yield:3.8  },
  { ticker:"KO",   name:"Coca-Cola",                      type:"Stock",  yield:3.0  },
  { ticker:"MCD",  name:"McDonald's",                     type:"Stock",  yield:2.3  },
  { ticker:"CVX",  name:"Chevron",                        type:"Stock",  yield:4.0  },
  { ticker:"PEP",  name:"PepsiCo",                        type:"Stock",  yield:3.2  },
  { ticker:"O",    name:"Realty Income",                  type:"REIT",   yield:5.5  },
  { ticker:"JNJ",  name:"Johnson & Johnson",              type:"Stock",  yield:3.2  },
  { ticker:"PG",   name:"Procter & Gamble",               type:"Stock",  yield:2.4  },
  { ticker:"T",    name:"AT&T",                           type:"Stock",  yield:6.0  },
  { ticker:"BTC",  name:"Bitcoin",                        type:"Crypto", yield:0    },
  { ticker:"ETH",  name:"Ethereum",                       type:"Crypto", yield:0    },
  { ticker:"XRP",  name:"Ripple",                         type:"Crypto", yield:0    },
  { ticker:"Flip", name:"Flip (Fixed Income)",            type:"Fixed",  yield:13.0 },
  { ticker:"SPY",  name:"SPDR S&P 500 ETF",               type:"ETF",    yield:1.3  },
  { ticker:"VOO",  name:"Vanguard S&P 500 ETF",           type:"ETF",    yield:1.3  },
];

const DEFAULT_HOLDINGS = [
  { id:"1",  ticker:"BTC",  name:"Bitcoin",                        type:"Crypto", qty:0.040064, unitPrice:78860.87, yield:0    },
  { id:"2",  ticker:"XRP",  name:"Ripple",                         type:"Crypto", qty:2079,     unitPrice:1.46,     yield:0    },
  { id:"3",  ticker:"JEPI", name:"JPMorgan Equity Premium Income", type:"ETF",    qty:46.05,    unitPrice:57.50,    yield:7.5  },
  { id:"4",  ticker:"ETH",  name:"Ethereum",                       type:"Crypto", qty:0.6782,   unitPrice:2411.66,  yield:0    },
  { id:"5",  ticker:"VYM",  name:"Vanguard High Dividend Yield",   type:"ETF",    qty:4,        unitPrice:155.24,   yield:2.8  },
  { id:"6",  ticker:"SPYD", name:"SPDR S&P 500 High Dividend",     type:"ETF",    qty:12,       unitPrice:46.26,    yield:4.5  },
  { id:"7",  ticker:"SCHD", name:"Schwab US Dividend Equity",      type:"ETF",    qty:15,       unitPrice:31.15,    yield:3.6  },
  { id:"8",  ticker:"MCD",  name:"McDonald's",                     type:"Stock",  qty:1,        unitPrice:302.58,   yield:2.3  },
  { id:"9",  ticker:"SPHD", name:"Invesco S&P 500 High Div",       type:"ETF",    qty:5,        unitPrice:49.50,    yield:4.0  },
  { id:"10", ticker:"VYMI", name:"Vanguard Intl High Dividend",    type:"ETF",    qty:2,        unitPrice:98.52,    yield:4.0  },
  { id:"11", ticker:"CVX",  name:"Chevron",                        type:"Stock",  qty:1,        unitPrice:187.27,   yield:4.0  },
  { id:"12", ticker:"PEP",  name:"PepsiCo",                        type:"Stock",  qty:1,        unitPrice:156.10,   yield:3.2  },
  { id:"13", ticker:"KO",   name:"Coca-Cola",                      type:"Stock",  qty:2,        unitPrice:75.33,    yield:3.0  },
  { id:"14", ticker:"Flip", name:"Flip (Fixed Income)",            type:"Fixed",  qty:1,        unitPrice:567.11,   yield:13.0 },
];

const tv = h => h.qty * h.unitPrice;
const color = h => TYPE_COLORS[h.type] || "#4ade80";
const fmt = n => n>=1e6?`$${(n/1e6).toFixed(2)}M`:n>=1e3?`$${(n/1e3).toFixed(1)}k`:`$${Math.round(n).toLocaleString()}`;
const fmtFull = n => "$" + Math.round(n).toLocaleString();
const fmtDec = n => "$" + Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const pctOf = (a,b) => b===0?0:((a/b)*100).toFixed(1);
let _id = 200;
const newId = () => String(_id++);

export default function App() {
  const [holdings, setHoldings] = useState(DEFAULT_HOLDINGS);
  const [monthly, setMonthly]   = useState(1000);
  const [tab, setTab]           = useState("dashboard");
  const [showAdd, setShowAdd]   = useState(false);
  const [editId, setEditId]     = useState(null);
  const [syncStatus, setSyncStatus] = useState("synced");
  const [form, setForm]         = useState({ticker:"",name:"",type:"ETF",qty:"",unitPrice:"",yield:""});
  const [search, setSearch]     = useState("");

  useEffect(() => {
    const ref = doc(db, COLLECTION, DOC_ID);
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.holdings) setHoldings(data.holdings);
        if (data.monthly)  setMonthly(data.monthly);
      }
    }, () => setSyncStatus("error"));
    return () => unsub();
  }, []);

  const saveToFirebase = useCallback(async (h, m) => {
    setSyncStatus("saving");
    try {
      await setDoc(doc(db, COLLECTION, DOC_ID), {holdings:h, monthly:m, updatedAt:new Date().toISOString()});
      setSyncStatus("synced");
    } catch { setSyncStatus("error"); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => saveToFirebase(holdings, monthly), 1200);
    return () => clearTimeout(t);
  }, [holdings, monthly, saveToFirebase]);

  const totalValue    = useMemo(() => holdings.reduce((a,h)=>a+tv(h),0), [holdings]);
  const annualIncome  = useMemo(() => holdings.reduce((a,h)=>a+tv(h)*(h.yield/100),0), [holdings]);
  const monthlyIncome = annualIncome/12;
  const blendedYield  = totalValue>0?(annualIncome/totalValue)*100:0;
  const progressPct   = Math.min((monthlyIncome/GOAL)*100,100);
  const remaining     = Math.max(GOAL-monthlyIncome,0);

  const projection = useMemo(() => {
    let portfolio = totalValue;
    const by = blendedYield/100;
    return Array.from({length:21},(_,y)=>{
      const ann = portfolio*by;
      const point = {year:y, portfolio:Math.round(portfolio), monthlyIncome:Math.round(ann/12)};
      for(let m=0;m<12;m++){portfolio=portfolio+monthly+portfolio*(by/12)*0.8; portfolio*=(1+0.04/12);}
      return point;
    });
  }, [totalValue, blendedYield, monthly]);

  const goalYear = projection.find(d=>d.monthlyIncome>=GOAL);
  const grouped  = useMemo(()=>holdings.reduce((g,h)=>{(g[h.type]=g[h.type]||[]).push(h);return g;},{}), [holdings]);

  const addHolding = () => {
    if(!form.ticker||!form.qty||!form.unitPrice) return;
    setHoldings(hs=>[...hs,{id:newId(),ticker:form.ticker.toUpperCase(),name:form.name||form.ticker.toUpperCase(),type:form.type,qty:parseFloat(form.qty)||0,unitPrice:parseFloat(form.unitPrice)||0,yield:parseFloat(form.yield)||0}]);
    setForm({ticker:"",name:"",type:"ETF",qty:"",unitPrice:"",yield:""}); setSearch(""); setShowAdd(false);
  };
  const updateH = (id,field,val) => setHoldings(hs=>hs.map(h=>h.id===id?{...h,[field]:["qty","unitPrice","yield"].includes(field)?parseFloat(val)||0:val}:h));
  const removeH = id => setHoldings(hs=>hs.filter(h=>h.id!==id));
  const applyPreset = p => {setForm(f=>({...f,ticker:p.ticker,name:p.name,type:p.type,yield:String(p.yield)}));setSearch("");};
  const filteredPresets = search.length>1?PRESET_ASSETS.filter(p=>p.ticker.toLowerCase().includes(search.toLowerCase())||p.name.toLowerCase().includes(search.toLowerCase())):[];

  const S = {
    surface:{background:"#0e1118",border:"1px solid #1a1e2e",borderRadius:14,padding:"20px 22px"},
    input:{background:"#080a0f",border:"1px solid #1a1e2e",borderRadius:8,color:"#e8eaf0",padding:"9px 12px",fontSize:13,outline:"none",width:"100%"},
    inline:{background:"#080a0f",border:"1px solid #1a1e2e",borderRadius:6,color:"#e8eaf0",padding:"4px 7px",fontSize:12,outline:"none"},
    tab:t=>({padding:"9px 16px",borderRadius:"8px 8px 0 0",border:"none",cursor:"pointer",fontSize:13,fontWeight:500,background:tab===t?"#0e1118":"transparent",color:tab===t?"#4ade80":"#5a6080",borderBottom:tab===t?"2px solid #4ade80":"2px solid transparent",transition:"all .2s",whiteSpace:"nowrap"}),
    pill:active=>({padding:"6px 14px",borderRadius:8,border:"1px solid",borderColor:active?"#4ade80":"#1a1e2e",background:active?"#4ade8015":"transparent",color:active?"#4ade80":"#5a6080",cursor:"pointer",fontSize:12}),
  };

  const CustomTooltip = ({active,payload,label}) => {
    if(!active||!payload?.length) return null;
    return <div style={{background:"#0a0c12",border:"1px solid #1a1e2e",borderRadius:8,padding:"12px 16px"}}>
      <div style={{color:"#5a6080",fontSize:11,marginBottom:4}}>{label===0?"Hoy":`Año ${label}`}</div>
      <div style={{color:"#4ade80",fontSize:15,fontWeight:700}}>{fmtFull(payload[0]?.value)}/mes</div>
      <div style={{color:"#374060",fontSize:11,marginTop:3}}>Portfolio: {fmt(payload[1]?.value)}</div>
    </div>;
  };

  const syncMap = {synced:["#4ade80","Sincronizado"],saving:["#f59e0b","Guardando…"],error:["#f87171","Error"]};
  const [sc,sl] = syncMap[syncStatus]||syncMap.synced;

  return (
    <div style={{minHeight:"100vh",background:"#080a0f",color:"#e8eaf0",fontFamily:"'DM Sans',sans-serif",paddingBottom:40}}>
      <div style={{maxWidth:960,margin:"0 auto",padding:"24px 16px 0"}}>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24,flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
              <div style={{width:6,height:24,background:"linear-gradient(180deg,#4ade80,#22c55e)",borderRadius:3}}/>
              <span style={{color:"#4ade80",fontSize:10,letterSpacing:3,textTransform:"uppercase"}}>Portfolio Tracker</span>
              <div style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:sc}}>
                <div style={{width:5,height:5,borderRadius:"50%",background:sc,boxShadow:`0 0 5px ${sc}`}}/>
                {sl}
              </div>
            </div>
            <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:"clamp(20px,5vw,34px)",fontWeight:900,lineHeight:1.05,background:"linear-gradient(135deg,#fff 50%,#4ade80)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",margin:0}}>
              Portafolio Edu & Lu
            </h1>
            <p style={{color:"#5a6080",fontSize:12,marginTop:4}}>Meta: {fmtFull(GOAL)}/mes · Thailand & Bali 🌴</p>
          </div>
          <button onClick={()=>setShowAdd(true)} style={{background:"#4ade80",color:"#080a0f",border:"none",borderRadius:10,padding:"10px 18px",fontWeight:700,fontSize:13,cursor:"pointer",boxShadow:"0 0 20px #4ade8033"}}>+ Agregar</button>
        </div>

        <div style={{...S.surface,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
            <div>
              <div style={{fontSize:10,color:"#5a6080",textTransform:"uppercase",letterSpacing:1.5,marginBottom:4}}>Ingreso mensual actual</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:"clamp(24px,5vw,36px)",fontWeight:700,color:"#4ade80",lineHeight:1}}>
                {fmtFull(monthlyIncome)}<span style={{fontSize:13,color:"#5a6080",fontFamily:"'DM Sans',sans-serif"}}>/mes</span>
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:10,color:"#5a6080",textTransform:"uppercase",letterSpacing:1.5,marginBottom:4}}>Faltan</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:"clamp(24px,5vw,36px)",fontWeight:700,color:"#f87171",lineHeight:1}}>
                {fmtFull(remaining)}<span style={{fontSize:13,color:"#5a6080",fontFamily:"'DM Sans',sans-serif"}}>/mes</span>
              </div>
            </div>
          </div>
          <div style={{background:"#1a1e2e",borderRadius:99,height:12,overflow:"hidden"}}>
            <div style={{height:"100%",borderRadius:99,width:`${progressPct}%`,background:"linear-gradient(90deg,#22c55e,#4ade80,#86efac)",transition:"width .8s",boxShadow:"0 0 14px #4ade8055"}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
            <span style={{fontSize:11,color:"#4ade80"}}>{progressPct.toFixed(1)}% alcanzado</span>
            <span style={{fontSize:11,color:"#374060"}}>Meta: {fmtFull(GOAL)}/mes</span>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:20}}>
          {[
            {label:"Valor Total",  value:fmt(totalValue),            color:"#60a5fa"},
            {label:"Yield Blended",value:blendedYield.toFixed(2)+"%",color:"#a78bfa"},
            {label:"Ingreso Anual",value:fmt(annualIncome),          color:"#4ade80"},
            {label:"Meta en",      value:goalYear?`Año ${goalYear.year}`:"20yr+",color:"#f59e0b"},
          ].map(c=>(
            <div key={c.label} style={{background:"#0e1118",border:"1px solid #1a1e2e",borderTop:`2px solid ${c.color}30`,borderRadius:12,padding:"13px 15px"}}>
              <div style={{fontSize:9,color:"#5a6080",textTransform:"uppercase",letterSpacing:1.5,marginBottom:6}}>{c.label}</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:19,fontWeight:700,color:c.color}}>{c.value}</div>
            </div>
          ))}
        </div>

        <div style={{display:"flex",gap:2,borderBottom:"1px solid #1a1e2e",marginBottom:18,overflowX:"auto"}}>
          {[["dashboard","📊 Dashboard"],["holdings","💼 Posiciones"],["projection","📈 Proyección"]].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={S.tab(t)}>{l}</button>
          ))}
        </div>

        {tab==="dashboard"&&(
          <div style={{display:"grid",gap:14}}>
            <div style={S.surface}>
              <div style={{fontSize:10,color:"#5a6080",textTransform:"uppercase",letterSpacing:1.5,marginBottom:16}}>Por tipo de activo</div>
              {Object.entries(grouped).map(([type,hs])=>{
                const tVal=hs.reduce((a,h)=>a+tv(h),0);
                const tInc=hs.reduce((a,h)=>a+tv(h)*(h.yield/100),0);
                const tc=TYPE_COLORS[type]||"#4ade80";
                const tp=pctOf(tVal,totalValue);
                return <div key={type} style={{marginBottom:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:tc}}/>
                      <span style={{fontSize:14,fontWeight:600}}>{type}</span>
                      <span style={{fontSize:10,color:"#5a6080"}}>{hs.length} pos.</span>
                    </div>
                    <div>
                      <span style={{fontSize:14,fontWeight:700,color:tc}}>{fmt(tVal)}</span>
                      <span style={{fontSize:10,color:"#5a6080",marginLeft:6}}>{tp}%</span>
                    </div>
                  </div>
                  <div style={{background:"#1a1e2e",borderRadius:99,height:5,overflow:"hidden",marginBottom:3}}>
                    <div style={{height:"100%",width:`${tp}%`,background:tc+"66",borderRadius:99}}/>
                  </div>
                  <div style={{fontSize:10,color:"#374060"}}>Income: {fmtFull(tInc/12)}/mes</div>
                </div>;
              })}
            </div>
            <div style={S.surface}>
              <div style={{fontSize:10,color:"#5a6080",textTransform:"uppercase",letterSpacing:1.5,marginBottom:16}}>Top posiciones</div>
              {[...holdings].sort((a,b)=>tv(b)-tv(a)).slice(0,7).map(h=>{
                const val=tv(h);
                return <div key={h.id} style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                  <div style={{width:34,height:34,borderRadius:9,background:color(h)+"1a",border:`1px solid ${color(h)}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:color(h),flexShrink:0,fontFamily:"'DM Mono',monospace"}}>
                    {h.ticker.slice(0,4)}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:13,fontWeight:600}}>{h.ticker}</span>
                      <span style={{fontSize:13,fontWeight:700,color:color(h)}}>{fmt(val)}</span>
                    </div>
                    <div style={{background:"#1a1e2e",borderRadius:99,height:3,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${pctOf(val,totalValue)}%`,background:color(h)+"55",borderRadius:99}}/>
                    </div>
                  </div>
                  <div style={{textAlign:"right",fontSize:10,color:"#374060",flexShrink:0,minWidth:60}}>
                    {h.yield>0?`${fmtFull(val*h.yield/100/12)}/mo`:"—"}
                  </div>
                </div>;
              })}
            </div>
          </div>
        )}

        {tab==="holdings"&&(
          <div style={S.surface}>
            <div style={{fontSize:10,color:"#5a6080",textTransform:"uppercase",letterSpacing:1.5,marginBottom:16}}>Todas las posiciones</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{borderBottom:"1px solid #1a1e2e"}}>
                    {["Ticker","Tipo","Cantidad","Precio Unit.","Valor Total","Yield","Income/mes",""].map(h=>(
                      <th key={h} style={{textAlign:"left",padding:"6px 8px",color:"#374060",fontWeight:400,fontSize:10,whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...holdings].sort((a,b)=>tv(b)-tv(a)).map(h=>{
                    const val=tv(h); const ed=editId===h.id; const c=color(h);
                    return <tr key={h.id} style={{borderBottom:"1px solid #0a0c12",background:ed?"#4ade8005":"transparent"}}>
                      <td style={{padding:"9px 8px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <div style={{width:5,height:5,borderRadius:"50%",background:c,flexShrink:0}}/>
                          <span style={{fontWeight:700,fontSize:13,fontFamily:"'DM Mono',monospace"}}>{h.ticker}</span>
                        </div>
                        <div style={{fontSize:10,color:"#374060",marginTop:1,paddingLeft:11}}>{h.name.length>24?h.name.slice(0,24)+"…":h.name}</div>
                      </td>
                      <td style={{padding:"9px 8px"}}><span style={{fontSize:9,background:"#1a1e2e",color:c,padding:"2px 7px",borderRadius:10}}>{h.type}</span></td>
                      <td style={{padding:"9px 8px"}}>
                        {ed?<input type="number" value={h.qty} onChange={e=>updateH(h.id,"qty",e.target.value)} style={{...S.inline,width:90}}/>
                          :<span style={{color:"#e8eaf0",fontFamily:"'DM Mono',monospace"}}>{h.qty%1===0?h.qty:parseFloat(Number(h.qty).toFixed(6))}</span>}
                      </td>
                      <td style={{padding:"9px 8px"}}>
                        {ed?<input type="number" value={h.unitPrice} onChange={e=>updateH(h.id,"unitPrice",e.target.value)} style={{...S.inline,width:90}}/>
                          :<span style={{color:"#5a6080",fontFamily:"'DM Mono',monospace"}}>{fmtDec(h.unitPrice)}</span>}
                      </td>
                      <td style={{padding:"9px 8px"}}><span style={{fontWeight:700,color:c,fontFamily:"'DM Mono',monospace"}}>{fmtFull(val)}</span></td>
                      <td style={{padding:"9px 8px"}}>
                        {ed?<input type="number" value={h.yield} onChange={e=>updateH(h.id,"yield",e.target.value)} style={{...S.inline,width:55}}/>
                          :<span style={{color:h.yield>0?"#4ade80":"#374060"}}>{h.yield>0?h.yield+"%":"—"}</span>}
                      </td>
                      <td style={{padding:"9px 8px",color:"#5a6080",fontFamily:"'DM Mono',monospace"}}>{h.yield>0?fmtFull(val*h.yield/100/12):"—"}</td>
                      <td style={{padding:"9px 8px"}}>
                        <div style={{display:"flex",gap:4}}>
                          <button onClick={()=>setEditId(ed?null:h.id)} style={{background:ed?"#4ade8020":"#1a1e2e",border:ed?"1px solid #4ade8040":"none",color:ed?"#4ade80":"#5a6080",borderRadius:6,padding:"4px 9px",cursor:"pointer",fontSize:11}}>{ed?"✓":"Edit"}</button>
                          <button onClick={()=>removeH(h.id)} style={{background:"#f8717115",border:"1px solid #f8717125",color:"#f87171",borderRadius:6,padding:"4px 7px",cursor:"pointer",fontSize:12}}>×</button>
                        </div>
                      </td>
                    </tr>;
                  })}
                </tbody>
                <tfoot>
                  <tr style={{borderTop:"2px solid #1a1e2e"}}>
                    <td colSpan={4} style={{padding:"10px 8px",color:"#5a6080",fontSize:10}}>Total · {holdings.length} posiciones</td>
                    <td style={{padding:"10px 8px",fontWeight:700,color:"#4ade80",fontSize:14,fontFamily:"'DM Mono',monospace"}}>{fmtFull(totalValue)}</td>
                    <td style={{padding:"10px 8px",color:"#a78bfa",fontSize:11}}>{blendedYield.toFixed(2)}%</td>
                    <td style={{padding:"10px 8px",fontWeight:700,color:"#4ade80",fontFamily:"'DM Mono',monospace"}}>{fmtFull(monthlyIncome)}/mes</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {tab==="projection"&&(
          <div style={{display:"grid",gap:14}}>
            <div style={S.surface}>
              <div style={{fontSize:10,color:"#5a6080",textTransform:"uppercase",letterSpacing:1.5,marginBottom:10}}>Aporte mensual</div>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
                <input type="range" min={100} max={10000} step={100} value={monthly} onChange={e=>setMonthly(Number(e.target.value))} style={{flex:1,accentColor:"#4ade80"}}/>
                <span style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:"#fff",minWidth:110,textAlign:"right"}}>{fmtFull(monthly)}/mo</span>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {[500,1000,2000,3000,5000].map(v=>(
                  <button key={v} onClick={()=>setMonthly(v)} style={S.pill(monthly===v)}>{fmtFull(v)}</button>
                ))}
              </div>
            </div>
            <div style={{...S.surface,padding:"20px 8px 14px"}}>
              <div style={{paddingLeft:16,fontSize:10,color:"#5a6080",textTransform:"uppercase",letterSpacing:1.5,marginBottom:14}}>Ingreso mensual proyectado</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={projection} margin={{top:4,right:20,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1e2e"/>
                  <XAxis dataKey="year" tick={{fill:"#374060",fontSize:10}} tickFormatter={v=>v===0?"Hoy":`Año ${v}`}/>
                  <YAxis tick={{fill:"#374060",fontSize:10}} tickFormatter={v=>`$${(v/1000).toFixed(0)}k`} width={40}/>
                  <Tooltip content={<CustomTooltip/>}/>
                  {goalYear&&<ReferenceLine x={goalYear.year} stroke="#f59e0b44" label={{value:"$3k 🌴",fill:"#f59e0b",fontSize:10}}/>}
                  <Line type="monotone" dataKey="monthlyIncome" stroke="#4ade80" strokeWidth={2.5} dot={false}/>
                  <Line type="monotone" dataKey="portfolio" stroke="#1e3a2a" strokeWidth={1} dot={false}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={S.surface}>
              <div style={{fontSize:10,color:"#5a6080",textTransform:"uppercase",letterSpacing:1.5,marginBottom:14}}>Hitos</div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{borderBottom:"1px solid #1a1e2e"}}>
                    {["Año","Portfolio","Income/mes","Meta"].map(h=>(
                      <th key={h} style={{textAlign:"left",padding:"6px 10px",color:"#374060",fontWeight:400,fontSize:10}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {projection.filter((_,i)=>i%2===0).map(row=>{
                    const ig=goalYear&&row.year===goalYear.year;
                    return <tr key={row.year} style={{borderBottom:"1px solid #0a0c12",background:ig?"#f59e0b08":"transparent"}}>
                      <td style={{padding:"8px 10px",color:ig?"#f59e0b":"#5a6080"}}>{row.year===0?"Hoy":`Año ${row.year}`}</td>
                      <td style={{padding:"8px 10px",fontWeight:600,fontFamily:"'DM Mono',monospace"}}>{fmt(row.portfolio)}</td>
                      <td style={{padding:"8px 10px",color:ig?"#f59e0b":"#e8eaf0",fontWeight:ig?700:400,fontFamily:"'DM Mono',monospace"}}>{fmtFull(row.monthlyIncome)}</td>
                      <td style={{padding:"8px 10px"}}>{ig&&<span style={{color:"#f59e0b",fontSize:11}}>🌴 $3k!</span>}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{textAlign:"center",color:"#1e2235",fontSize:10,marginTop:20}}>
          Valor = Cantidad × Precio · Sync Firebase · No es asesoría financiera
        </div>
      </div>

      {showAdd&&(
        <div style={{position:"fixed",inset:0,background:"#000000dd",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}}
          onClick={e=>{if(e.target===e.currentTarget){setShowAdd(false);setSearch("");}}}>
          <div style={{background:"#0e1118",border:"1px solid #1a1e2e",borderRadius:18,padding:"26px 22px",width:"100%",maxWidth:420,maxHeight:"88vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
              <h3 style={{margin:0,fontSize:17,fontWeight:700}}>Agregar posición</h3>
              <button onClick={()=>{setShowAdd(false);setSearch("");setForm({ticker:"",name:"",type:"ETF",qty:"",unitPrice:"",yield:""});}}
                style={{background:"none",border:"none",color:"#5a6080",fontSize:22,cursor:"pointer",lineHeight:1}}>×</button>
            </div>
            <input placeholder="Buscar: JEPI, KO, BTC…" value={search} onChange={e=>setSearch(e.target.value)} style={{...S.input,marginBottom:6}}/>
            {filteredPresets.length>0&&(
              <div style={{background:"#080a0f",border:"1px solid #1a1e2e",borderRadius:10,marginBottom:12,maxHeight:180,overflowY:"auto"}}>
                {filteredPresets.slice(0,7).map(p=>(
                  <div key={p.ticker} onClick={()=>applyPreset(p)}
                    style={{padding:"9px 14px",cursor:"pointer",borderBottom:"1px solid #1a1e2e",display:"flex",justifyContent:"space-between"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#1a1e2e"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div>
                      <span style={{fontWeight:700,color:TYPE_COLORS[p.type]||"#4ade80",fontSize:13,fontFamily:"'DM Mono',monospace"}}>{p.ticker}</span>
                      <span style={{color:"#5a6080",fontSize:11,marginLeft:8}}>{p.name}</span>
                    </div>
                    <span style={{fontSize:10,color:"#374060"}}>{p.yield}%</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div>
                <label style={{fontSize:10,color:"#5a6080",letterSpacing:1,display:"block",marginBottom:4}}>TICKER</label>
                <input value={form.ticker} onChange={e=>setForm(f=>({...f,ticker:e.target.value.toUpperCase()}))} placeholder="JEPI" style={S.input}/>
              </div>
              <div>
                <label style={{fontSize:10,color:"#5a6080",letterSpacing:1,display:"block",marginBottom:4}}>TIPO</label>
                <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} style={S.input}>
                  {Object.keys(TYPE_COLORS).map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div style={{marginBottom:10}}>
              <label style={{fontSize:10,color:"#5a6080",letterSpacing:1,display:"block",marginBottom:4}}>NOMBRE</label>
              <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="opcional" style={S.input}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div>
                <label style={{fontSize:10,color:"#5a6080",letterSpacing:1,display:"block",marginBottom:4}}>CANTIDAD</label>
                <input type="number" value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))} placeholder="46.05" style={S.input}/>
              </div>
              <div>
                <label style={{fontSize:10,color:"#5a6080",letterSpacing:1,display:"block",marginBottom:4}}>PRECIO UNIT. ($)</label>
                <input type="number" value={form.unitPrice} onChange={e=>setForm(f=>({...f,unitPrice:e.target.value}))} placeholder="57.50" style={S.input}/>
              </div>
            </div>
            {form.qty&&form.unitPrice&&(
              <div style={{background:"#4ade8010",border:"1px solid #4ade8025",borderRadius:8,padding:"9px 13px",marginBottom:10,display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:11,color:"#5a6080"}}>Valor total =</span>
                <span style={{fontSize:15,fontWeight:700,color:"#4ade80",fontFamily:"'DM Mono',monospace"}}>{fmtDec(parseFloat(form.qty||0)*parseFloat(form.unitPrice||0))}</span>
              </div>
            )}
            <div style={{marginBottom:18}}>
              <label style={{fontSize:10,color:"#5a6080",letterSpacing:1,display:"block",marginBottom:4}}>YIELD ANUAL (%)</label>
              <input type="number" value={form.yield} onChange={e=>setForm(f=>({...f,yield:e.target.value}))} placeholder="7.5  (0 para crypto)" style={S.input}/>
            </div>
            <button onClick={addHolding} style={{width:"100%",background:"#4ade80",color:"#080a0f",border:"none",borderRadius:10,padding:"12px",fontWeight:700,fontSize:14,cursor:"pointer",boxShadow:"0 0 20px #4ade8033"}}>
              Agregar al portafolio
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
