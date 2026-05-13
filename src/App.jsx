import { useState, useMemo, useEffect, useCallback } from "react";

// ─── CONFIGURACIÓN ─────────────────────────────────────────────────────────────
// Pegá aquí tu Spreadsheet ID y API Key después de configurar Google Sheets
const SHEET_ID   = "TU_SPREADSHEET_ID";
const API_KEY    = "TU_API_KEY";
const SHEET_NAME = "Movimientos";
const LOG_SHEET  = "Auditoría";

const DEFAULT_CREDENTIALS = { "RoVasq": "RoVasq3", "JaVasq": "JaVasq3" };
const USERS = ["RoVasq", "JaVasq"];
const CATEGORIES = ["Choferes", "Seguros", "Carreta", "Salarios", "Combustible", "Mantenimiento", "Otro"];
const TRUCKS     = ["Camión Rojo", "Camión Azúl", "General"];
const GRAINS     = ["Maíz", "Trigo", "Arroz", "Otro"];
const MONTHS     = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const TRUCK_COLORS = {
  "Camión Rojo": { primary:"#ef4444", bg:"rgba(239,68,68,0.12)", border:"rgba(239,68,68,0.3)", text:"#fca5a5", icon:"🔴" },
  "Camión Azúl": { primary:"#3b82f6", bg:"rgba(59,130,246,0.12)", border:"rgba(59,130,246,0.3)", text:"#93c5fd", icon:"🔵" },
  "General":     { primary:"#94a3b8", bg:"rgba(148,163,184,0.10)", border:"rgba(148,163,184,0.2)", text:"#cbd5e1", icon:"⚙️" },
};

const USER_COLORS = {
  "RoVasq": { color:"#f59e0b", bg:"rgba(245,158,11,0.15)" },
  "JaVasq": { color:"#8b5cf6", bg:"rgba(139,92,246,0.15)" },
};

const today = new Date();

function formatCRC(n) {
  return "₡" + Math.abs(n).toLocaleString("es-CR", { minimumFractionDigits: 0 });
}
function nowStr() {
  return new Date().toLocaleString("es-CR", { dateStyle:"short", timeStyle:"short" });
}

// ─── GOOGLE SHEETS API ─────────────────────────────────────────────────────────
const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

async function sheetsGet(range) {
  const url = `${BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}?key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Error leyendo Sheets");
  const data = await res.json();
  return data.values || [];
}

async function sheetsAppend(range, values) {
  const url = `${BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS&key=${API_KEY}`;
  const res = await fetch(url, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ values })
  });
  if (!res.ok) throw new Error("Error guardando en Sheets");
  return res.json();
}

function rowToRecord(row) {
  if (!row[0]) return null;
  return {
    id:          row[0],
    type:        row[1],
    date:        row[2],
    category:    row[3] || null,
    truck:       row[4],
    grain:       row[5] || null,
    amount:      parseFloat(row[6]) || 0,
    description: row[7] || "",
    createdBy:   row[8] || "",
    createdAt:   row[9] || "",
    updatedBy:   row[10] || "",
    updatedAt:   row[11] || "",
  };
}

function recordToRow(r) {
  return [r.id, r.type, r.date, r.category||"", r.truck, r.grain||"",
          r.amount, r.description, r.createdBy, r.createdAt, r.updatedBy||"", r.updatedAt||""];
}

// ─── DEMO DATA ────────────────────────────────────────────────────────────────
const DEMO = [
  { id:"1", type:"gasto",   date:"2026-05-01", category:"Choferes", truck:"Camión Rojo", grain:null,    amount:85000,  description:"Sueldo mayo - Juan",      createdBy:"RoVasq", createdAt:"01/05/2026, 8:00",  updatedBy:"", updatedAt:"" },
  { id:"2", type:"gasto",   date:"2026-05-01", category:"Choferes", truck:"Camión Azúl", grain:null,    amount:85000,  description:"Sueldo mayo - Pedro",     createdBy:"JaVasq", createdAt:"01/05/2026, 8:05",  updatedBy:"", updatedAt:"" },
  { id:"3", type:"gasto",   date:"2026-05-01", category:"Salarios", truck:"General",     grain:null,    amount:60000,  description:"Mi salario mayo",         createdBy:"RoVasq", createdAt:"01/05/2026, 8:10",  updatedBy:"", updatedAt:"" },
  { id:"4", type:"gasto",   date:"2026-05-01", category:"Salarios", truck:"General",     grain:null,    amount:60000,  description:"Salario hermano mayo",    createdBy:"JaVasq", createdAt:"01/05/2026, 8:12",  updatedBy:"", updatedAt:"" },
  { id:"5", type:"gasto",   date:"2026-05-02", category:"Seguros",  truck:"Camión Rojo", grain:null,    amount:18000,  description:"Seguro mensual - Rojo",   createdBy:"RoVasq", createdAt:"02/05/2026, 9:00",  updatedBy:"", updatedAt:"" },
  { id:"6", type:"gasto",   date:"2026-05-02", category:"Seguros",  truck:"Camión Azúl", grain:null,    amount:18000,  description:"Seguro mensual - Azúl",   createdBy:"RoVasq", createdAt:"02/05/2026, 9:01",  updatedBy:"", updatedAt:"" },
  { id:"7", type:"gasto",   date:"2026-05-03", category:"Carreta",  truck:"General",     grain:null,    amount:35000,  description:"Cuota carreta mayo",      createdBy:"JaVasq", createdAt:"03/05/2026, 10:00", updatedBy:"", updatedAt:"" },
  { id:"8", type:"ingreso", date:"2026-05-05", category:null,       truck:"Camión Rojo", grain:"Maíz",  amount:220000, description:"Flete maíz - Cliente A",  createdBy:"RoVasq", createdAt:"05/05/2026, 14:00", updatedBy:"", updatedAt:"" },
  { id:"9", type:"ingreso", date:"2026-05-07", category:null,       truck:"Camión Azúl", grain:"Trigo", amount:195000, description:"Flete trigo - Cliente B", createdBy:"JaVasq", createdAt:"07/05/2026, 16:30", updatedBy:"", updatedAt:"" },
];

// ─── SUBCOMPONENTES ───────────────────────────────────────────────────────────
function Pill({ children, color, bg, border }) {
  return (
    <span style={{
      padding:"2px 10px", borderRadius:99, fontSize:11, fontWeight:700,
      whiteSpace:"nowrap", color, background:bg,
      border:`1px solid ${border||"transparent"}`
    }}>{children}</span>
  );
}

function FieldInput({ label, ...props }) {
  return (
    <div style={{marginBottom:14}}>
      <label style={{display:"block",fontSize:11,color:"#64748b",letterSpacing:"1px",fontWeight:600,marginBottom:6}}>{label.toUpperCase()}</label>
      <input {...props} style={{
        width:"100%", background:"#0f1117", border:"1px solid #2d3748",
        borderRadius:8, padding:"10px 12px", color:"#e2e8f0",
        fontSize:13, fontFamily:"inherit", boxSizing:"border-box", outline:"none"
      }} />
    </div>
  );
}

function FieldSelect({ label, children, ...props }) {
  return (
    <div style={{marginBottom:14}}>
      <label style={{display:"block",fontSize:11,color:"#64748b",letterSpacing:"1px",fontWeight:600,marginBottom:6}}>{label.toUpperCase()}</label>
      <select {...props} style={{
        width:"100%", background:"#0f1117", border:"1px solid #2d3748",
        borderRadius:8, padding:"10px 12px", color:"#e2e8f0",
        fontSize:13, fontFamily:"inherit", boxSizing:"border-box"
      }}>{children}</select>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, credentials }) {
  const [selected, setSelected] = useState(null);
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [showPwd,  setShowPwd]  = useState(false);

  function handleUserSelect(u) {
    setSelected(u);
    setPassword("");
    setError("");
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (credentials[selected] === password) {
      onLogin(selected);
    } else {
      setError("Contraseña incorrecta. Intentá de nuevo.");
      setPassword("");
    }
  }

  return (
    <div style={{
      minHeight:"100vh", background:"#0f1117",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"'IBM Plex Mono','Courier New',monospace", padding:20
    }}>
      <div style={{textAlign:"center", width:"100%", maxWidth:380}}>
        <div style={{fontSize:52, marginBottom:16}}>🌾</div>
        <div style={{fontSize:22, fontWeight:700, color:"#f1f5f9", marginBottom:4}}>TransporteGranos</div>
        <div style={{fontSize:11, color:"#475569", letterSpacing:"3px", marginBottom:40}}>GESTIÓN FINANCIERA</div>

        {/* Paso 1: elegir usuario */}
        <div style={{fontSize:11,color:"#64748b",letterSpacing:"1px",fontWeight:600,marginBottom:14}}>
          {selected ? "USUARIO" : "¿QUIÉN ESTÁ INGRESANDO?"}
        </div>
        <div style={{display:"flex", gap:14, justifyContent:"center", marginBottom: selected ? 24 : 0}}>
          {USERS.map(u => {
            const uc = USER_COLORS[u];
            const isSelected = selected === u;
            return (
              <button key={u} onClick={()=>handleUserSelect(u)} style={{
                background: isSelected ? uc.bg : "rgba(255,255,255,0.03)",
                border:`2px solid ${isSelected ? uc.color : "#2d3748"}`,
                color: isSelected ? uc.color : "#64748b",
                borderRadius:12, padding:"18px 36px",
                fontSize:15, fontWeight:700, cursor:"pointer",
                fontFamily:"inherit", letterSpacing:"0.5px",
                boxShadow: isSelected ? `0 4px 20px ${uc.color}33` : "none",
                transition:"all 0.15s"
              }}>{u}</button>
            );
          })}
        </div>

        {/* Paso 2: contraseña */}
        {selected && (
          <form onSubmit={handleSubmit} style={{
            background:"#1a1f2e", border:"1px solid #2d3748",
            borderRadius:14, padding:24, marginTop:8,
            textAlign:"left"
          }}>
            <label style={{display:"block",fontSize:11,color:"#64748b",letterSpacing:"1px",fontWeight:600,marginBottom:8}}>
              CONTRASEÑA
            </label>
            <div style={{position:"relative", marginBottom:16}}>
              <input
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={e=>{ setPassword(e.target.value); setError(""); }}
                placeholder="Ingresá tu contraseña"
                autoFocus
                style={{
                  width:"100%", background:"#0f1117", border:`1px solid ${error?"#ef4444":"#2d3748"}`,
                  borderRadius:8, padding:"11px 44px 11px 14px", color:"#e2e8f0",
                  fontSize:14, fontFamily:"inherit", boxSizing:"border-box", outline:"none"
                }}
              />
              <button type="button" onClick={()=>setShowPwd(s=>!s)} style={{
                position:"absolute", right:10, top:"50%", transform:"translateY(-50%)",
                background:"none", border:"none", color:"#64748b", cursor:"pointer",
                fontSize:16, padding:0
              }}>{showPwd ? "🙈" : "👁️"}</button>
            </div>

            {error && (
              <div style={{
                fontSize:12, color:"#ef4444", background:"rgba(239,68,68,0.1)",
                border:"1px solid rgba(239,68,68,0.25)", borderRadius:7,
                padding:"9px 14px", marginBottom:14, textAlign:"center"
              }}>{error}</div>
            )}

            <button type="submit" style={{
              width:"100%",
              background: password ? `linear-gradient(135deg,${USER_COLORS[selected].color},${USER_COLORS[selected].color}cc)` : "#2d3748",
              color: password ? "#000" : "#4b5563",
              border:"none", borderRadius:8, padding:"12px",
              fontSize:14, fontWeight:700, cursor: password ? "pointer" : "not-allowed",
              fontFamily:"inherit", transition:"all 0.15s",
              boxShadow: password ? `0 4px 14px ${USER_COLORS[selected].color}44` : "none"
            }}>Ingresar →</button>

            <button type="button" onClick={()=>{ setSelected(null); setError(""); }} style={{
              width:"100%", marginTop:10, background:"transparent",
              border:"none", color:"#475569", fontSize:12,
              cursor:"pointer", fontFamily:"inherit", padding:"6px"
            }}>← Cambiar usuario</button>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── MODAL FORMULARIO ─────────────────────────────────────────────────────────
function RecordModal({ user, initial, onSave, onClose }) {
  const isEdit = !!initial;
  const [form, setForm] = useState(isEdit ? {
    type:        initial.type,
    date:        initial.date,
    category:    initial.category || "Choferes",
    truck:       initial.truck,
    grain:       initial.grain || "Maíz",
    amount:      String(initial.amount),
    description: initial.description
  } : {
    type:"gasto", date:today.toISOString().slice(0,10),
    category:"Choferes", truck:"Camión Rojo", grain:"Maíz",
    amount:"", description:""
  });
  const [saving, setSaving] = useState(false);

  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  async function submit(e) {
    e.preventDefault();
    if (!form.amount || isNaN(+form.amount)) return;
    setSaving(true);
    await onSave(form, isEdit ? initial : null);
    setSaving(false);
    onClose();
  }

  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.75)",
      display:"flex", alignItems:"center", justifyContent:"center",
      zIndex:100, padding:16, backdropFilter:"blur(4px)"
    }}>
      <div style={{
        background:"#1a1f2e", border:"1px solid #2d3748", borderRadius:16,
        padding:28, width:"100%", maxWidth:480,
        boxShadow:"0 25px 60px rgba(0,0,0,0.5)",
        maxHeight:"90vh", overflowY:"auto"
      }}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <div style={{fontSize:15,fontWeight:700,color:"#f1f5f9"}}>
            {isEdit ? "✏️ Editar movimiento" : "➕ Nuevo movimiento"}
          </div>
          <button onClick={onClose} style={{
            background:"#2d3748",border:"none",color:"#94a3b8",
            borderRadius:6,width:30,height:30,cursor:"pointer",fontSize:16,fontFamily:"inherit"
          }}>✕</button>
        </div>

        <div style={{display:"flex",gap:8,marginBottom:18}}>
          {[["gasto","Gasto"],["ingreso","Ingreso"]].map(([v,l])=>(
            <button key={v} type="button" onClick={()=>set("type",v)} style={{
              flex:1, padding:"10px", border:"1px solid",
              borderColor: form.type===v?(v==="gasto"?"#ef4444":"#10b981"):"#2d3748",
              background: form.type===v?(v==="gasto"?"rgba(239,68,68,0.15)":"rgba(16,185,129,0.15)"):"transparent",
              color: form.type===v?(v==="gasto"?"#ef4444":"#10b981"):"#64748b",
              borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"
            }}>{l}</button>
          ))}
        </div>

        <form onSubmit={submit}>
          <FieldInput label="Fecha"       type="date"   value={form.date}        onChange={e=>set("date",e.target.value)} required />
          <FieldInput label="Monto (₡)"   type="number" value={form.amount}      onChange={e=>set("amount",e.target.value)} placeholder="0" required />
          <FieldInput label="Descripción" type="text"   value={form.description} onChange={e=>set("description",e.target.value)} placeholder="Ej: Sueldo mayo - Juan" />

          <FieldSelect label="Camión" value={form.truck} onChange={e=>set("truck",e.target.value)}>
            {TRUCKS.map(t=><option key={t}>{t}</option>)}
          </FieldSelect>

          {form.type==="gasto" && (
            <FieldSelect label="Categoría" value={form.category} onChange={e=>set("category",e.target.value)}>
              {CATEGORIES.map(c=><option key={c}>{c}</option>)}
            </FieldSelect>
          )}
          {form.type==="ingreso" && (
            <FieldSelect label="Grano" value={form.grain} onChange={e=>set("grain",e.target.value)}>
              {GRAINS.map(g=><option key={g}>{g}</option>)}
            </FieldSelect>
          )}

          <button type="submit" disabled={saving} style={{
            width:"100%", marginTop:8,
            background: saving?"#374151":"linear-gradient(135deg,#f59e0b,#d97706)",
            color: saving?"#9ca3af":"#000",
            border:"none", borderRadius:8, padding:"13px",
            fontSize:14, fontWeight:700, cursor:saving?"not-allowed":"pointer",
            fontFamily:"inherit", boxShadow:saving?"none":"0 4px 12px rgba(245,158,11,0.3)"
          }}>{saving?"Guardando…":(isEdit?"Guardar cambios":"Guardar movimiento")}</button>
        </form>
      </div>
    </div>
  );
}

// ─── MODAL CAMBIO DE CONTRASEÑA ───────────────────────────────────────────────
function ChangePasswordModal({ user, credentials, onSave, onClose }) {
  const [current,  setCurrent]  = useState("");
  const [next,     setNext]     = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [showCur,  setShowCur]  = useState(false);
  const [showNew,  setShowNew]  = useState(false);
  const [error,    setError]    = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (credentials[user] !== current) { setError("La contraseña actual es incorrecta."); return; }
    if (next.length < 4)               { setError("La nueva contraseña debe tener al menos 4 caracteres."); return; }
    if (next !== confirm)              { setError("Las contraseñas nuevas no coinciden."); return; }
    onSave(next);
    onClose();
  }

  const uc = USER_COLORS[user];

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:16,backdropFilter:"blur(4px)"}}>
      <div style={{background:"#1a1f2e",border:"1px solid #2d3748",borderRadius:16,padding:28,width:"100%",maxWidth:420,boxShadow:"0 25px 60px rgba(0,0,0,0.5)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:"#f1f5f9"}}>🔑 Cambiar contraseña</div>
            <div style={{fontSize:11,color:uc.color,fontWeight:600,marginTop:3}}>{user}</div>
          </div>
          <button onClick={onClose} style={{background:"#2d3748",border:"none",color:"#94a3b8",borderRadius:6,width:30,height:30,cursor:"pointer",fontSize:16,fontFamily:"inherit"}}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          {[
            {label:"Contraseña actual", value:current, set:setCurrent, show:showCur, toggle:()=>setShowCur(s=>!s)},
            {label:"Nueva contraseña",  value:next,    set:setNext,    show:showNew, toggle:()=>setShowNew(s=>!s)},
            {label:"Confirmar nueva",   value:confirm, set:setConfirm, show:showNew, toggle:()=>setShowNew(s=>!s)},
          ].map(f=>(
            <div key={f.label} style={{marginBottom:14}}>
              <label style={{display:"block",fontSize:11,color:"#64748b",letterSpacing:"1px",fontWeight:600,marginBottom:6}}>{f.label.toUpperCase()}</label>
              <div style={{position:"relative"}}>
                <input
                  type={f.show?"text":"password"}
                  value={f.value}
                  onChange={e=>{ f.set(e.target.value); setError(""); }}
                  required
                  style={{
                    width:"100%",background:"#0f1117",border:"1px solid #2d3748",
                    borderRadius:8,padding:"10px 40px 10px 12px",color:"#e2e8f0",
                    fontSize:13,fontFamily:"inherit",boxSizing:"border-box",outline:"none"
                  }}
                />
                <button type="button" onClick={f.toggle} style={{
                  position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",
                  background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:15,padding:0
                }}>{f.show?"🙈":"👁️"}</button>
              </div>
            </div>
          ))}

          {error && (
            <div style={{fontSize:12,color:"#ef4444",background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:7,padding:"9px 14px",marginBottom:14,textAlign:"center"}}>{error}</div>
          )}

          <button type="submit" style={{
            width:"100%",marginTop:4,
            background:`linear-gradient(135deg,${uc.color},${uc.color}bb)`,
            color:"#000",border:"none",borderRadius:8,padding:"12px",
            fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
            boxShadow:`0 4px 14px ${uc.color}44`
          }}>Guardar nueva contraseña</button>
        </form>
      </div>
    </div>
  );
}

// ─── APP PRINCIPAL ────────────────────────────────────────────────────────────
export default function App() {
  const [user,        setUser]        = useState(null);
  const [credentials, setCredentials] = useState(DEFAULT_CREDENTIALS);
  const [records,     setRecords]     = useState(DEMO);
  const [auditLog,    setAuditLog]    = useState([]);
  const [view,        setView]        = useState("dashboard");
  const [filterMonth, setFilterMonth] = useState(today.getMonth());
  const [filterYear]                  = useState(today.getFullYear());
  const [filterType,  setFilterType]  = useState("todos");
  const [showForm,    setShowForm]    = useState(false);
  const [editRecord,  setEditRecord]  = useState(null);
  const [deleteId,    setDeleteId]    = useState(null);
  const [showPwdChange, setShowPwdChange] = useState(false);
  const [toast,       setToast]       = useState(null);
  const [sheetsOk,    setSheetsOk]    = useState(false);

  const sheetsConfigured = SHEET_ID !== "TU_SPREADSHEET_ID" && API_KEY !== "TU_API_KEY";

  function showToast(msg, type="ok") {
    setToast({msg,type});
    setTimeout(()=>setToast(null), 3500);
  }

  function handlePasswordChange(newPwd) {
    setCredentials(prev => ({ ...prev, [user]: newPwd }));
    showToast("Contraseña actualizada ✓");
  }

  const loadFromSheets = useCallback(async () => {
    if (!sheetsConfigured) return;
    try {
      const rows = await sheetsGet(`${SHEET_NAME}!A2:L`);
      setRecords(rows.map(rowToRecord).filter(Boolean));
      const logRows = await sheetsGet(`${LOG_SHEET}!A2:E`);
      setAuditLog(logRows.map(r=>({ fecha:r[0], usuario:r[1], accion:r[2], descripcion:r[3], monto:r[4] })));
      setSheetsOk(true);
    } catch {
      showToast("No se pudo conectar con Google Sheets. Usando datos de demo.", "warn");
    }
  }, [sheetsConfigured]);

  useEffect(() => { if (sheetsConfigured) loadFromSheets(); }, [loadFromSheets]);

  function addAudit(accion, rec) {
    setAuditLog(prev => [{
      fecha: nowStr(), usuario: user, accion,
      descripcion: rec.description, monto: formatCRC(rec.amount)
    }, ...prev]);
  }

  async function handleSave(form, existing) {
    const now = nowStr();
    if (existing) {
      const updated = {
        ...existing,
        type:        form.type,
        date:        form.date,
        category:    form.type==="ingreso" ? null : form.category,
        truck:       form.truck,
        grain:       form.type==="gasto" ? null : form.grain,
        amount:      +form.amount,
        description: form.description,
        updatedBy:   user,
        updatedAt:   now,
      };
      setRecords(prev => prev.map(r => r.id===existing.id ? updated : r));
      addAudit("EDITÓ", updated);
      showToast("Movimiento actualizado ✓");
    } else {
      const newRec = {
        id:          String(Date.now()),
        type:        form.type,
        date:        form.date,
        category:    form.type==="ingreso" ? null : form.category,
        truck:       form.truck,
        grain:       form.type==="gasto" ? null : form.grain,
        amount:      +form.amount,
        description: form.description,
        createdBy:   user,
        createdAt:   now,
        updatedBy:   "",
        updatedAt:   "",
      };
      setRecords(prev => [newRec, ...prev]);
      addAudit("CREÓ", newRec);
      if (sheetsConfigured && sheetsOk) {
        try { await sheetsAppend(`${SHEET_NAME}!A:L`, [recordToRow(newRec)]); }
        catch { showToast("Error guardando en Sheets","err"); }
      }
      showToast("Movimiento guardado ✓");
    }
  }

  function handleDelete(id) {
    const rec = records.find(r=>r.id===id);
    setRecords(prev => prev.filter(r=>r.id!==id));
    addAudit("ELIMINÓ", rec);
    setDeleteId(null);
    showToast("Movimiento eliminado");
  }

  // Filtros y cálculos
  const filtered = useMemo(() => records.filter(r => {
    const d = new Date(r.date);
    return d.getMonth()===filterMonth && d.getFullYear()===filterYear &&
           (filterType==="todos" || r.type===filterType);
  }), [records, filterMonth, filterYear, filterType]);

  const totalIngresos = filtered.filter(r=>r.type==="ingreso").reduce((a,r)=>a+r.amount,0);
  const totalGastos   = filtered.filter(r=>r.type==="gasto").reduce((a,r)=>a+r.amount,0);
  const balance       = totalIngresos - totalGastos;

  const byCategory = useMemo(()=>{
    const map={};
    filtered.filter(r=>r.type==="gasto").forEach(r=>{ map[r.category]=(map[r.category]||0)+r.amount; });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]);
  },[filtered]);

  const byTruck = useMemo(()=>{
    const map={};
    ["Camión Rojo","Camión Azúl"].forEach(t=>{
      map[t]={
        ingresos: filtered.filter(r=>r.truck===t&&r.type==="ingreso").reduce((a,r)=>a+r.amount,0),
        gastos:   filtered.filter(r=>r.truck===t&&r.type==="gasto").reduce((a,r)=>a+r.amount,0),
      };
    });
    return map;
  },[filtered]);

  const maxCat = byCategory.length ? byCategory[0][1] : 1;

  if (!user) return <LoginScreen onLogin={setUser} credentials={credentials} />;

  const uc = USER_COLORS[user];

  return (
    <div style={{fontFamily:"'IBM Plex Mono','Courier New',monospace",background:"#0f1117",minHeight:"100vh",color:"#e2e8f0"}}>

      {/* Toast */}
      {toast && (
        <div style={{
          position:"fixed",top:20,right:20,zIndex:999,
          background: toast.type==="ok"?"#064e3b":toast.type==="warn"?"#78350f":"#7f1d1d",
          border:`1px solid ${toast.type==="ok"?"#10b981":toast.type==="warn"?"#f59e0b":"#ef4444"}`,
          color:"#f1f5f9",borderRadius:10,padding:"12px 20px",fontSize:13,fontWeight:600,
          boxShadow:"0 8px 24px rgba(0,0,0,0.4)",maxWidth:320
        }}>{toast.msg}</div>
      )}

      {/* Header */}
      <div style={{
        background:"linear-gradient(135deg,#1a1f2e,#0f1117)",
        borderBottom:"1px solid #1e2a3a",padding:"0 20px",
        display:"flex",alignItems:"center",justifyContent:"space-between",
        position:"sticky",top:0,zIndex:50,gap:12,flexWrap:"wrap"
      }}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"14px 0"}}>
          <div style={{width:34,height:34,borderRadius:8,background:"linear-gradient(135deg,#f59e0b,#d97706)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🌾</div>
          <div>
            <div style={{fontWeight:700,fontSize:14,color:"#f1f5f9"}}>TransporteGranos</div>
            <div style={{fontSize:9,color:"#64748b",letterSpacing:"1px"}}>GESTIÓN FINANCIERA</div>
          </div>
        </div>

        <nav style={{display:"flex",gap:4}}>
          {[["dashboard","📊 Resumen"],["movimientos","📋 Movimientos"],["auditoria","🔍 Auditoría"]].map(([k,label])=>(
            <button key={k} onClick={()=>setView(k)} style={{
              background:view===k?"#f59e0b":"transparent",
              color:view===k?"#000":"#94a3b8",
              border:"none",borderRadius:6,padding:"7px 11px",
              fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"
            }}>{label}</button>
          ))}
        </nav>

        <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0"}}>
          {!sheetsConfigured && (
            <span style={{fontSize:9,color:"#f59e0b",background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.3)",borderRadius:4,padding:"3px 7px",fontWeight:700}}>DEMO</span>
          )}
          <div style={{background:uc.bg,border:`1px solid ${uc.color}55`,borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,color:uc.color}}>{user}</div>
          <button onClick={()=>setShowPwdChange(true)} style={{
            background:"transparent",border:"1px solid #2d3748",color:"#64748b",
            borderRadius:6,padding:"6px 10px",fontSize:13,cursor:"pointer",fontFamily:"inherit",
            title:"Cambiar contraseña"
          }} title="Cambiar contraseña">🔑</button>
          <button onClick={()=>setUser(null)} style={{
            background:"transparent",border:"1px solid #2d3748",color:"#64748b",
            borderRadius:6,padding:"6px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit"
          }}>Salir</button>
        </div>
      </div>

      <div style={{maxWidth:920,margin:"0 auto",padding:"24px 16px"}}>

        {/* Selector mes + botón nuevo */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24,flexWrap:"wrap",gap:12}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:10,color:"#64748b",fontWeight:600,letterSpacing:"1px"}}>MES</span>
            <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
              {MONTHS.map((m,i)=>(
                <button key={i} onClick={()=>setFilterMonth(i)} style={{
                  background:filterMonth===i?"#f59e0b":"#1e2a3a",
                  color:filterMonth===i?"#000":"#64748b",
                  border:"1px solid",borderColor:filterMonth===i?"#f59e0b":"#2d3748",
                  borderRadius:4,padding:"3px 7px",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"
                }}>{m.slice(0,3)}</button>
              ))}
            </div>
          </div>
          <button onClick={()=>{ setEditRecord(null); setShowForm(true); }} style={{
            background:"linear-gradient(135deg,#f59e0b,#d97706)",
            color:"#000",border:"none",borderRadius:8,padding:"10px 18px",
            fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
            boxShadow:"0 4px 12px rgba(245,158,11,0.3)"
          }}>＋ Nuevo movimiento</button>
        </div>

        {/* ══ DASHBOARD ══ */}
        {view==="dashboard" && (
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:14,marginBottom:20}}>
              {[
                {label:"INGRESOS", value:totalIngresos, color:"#10b981"},
                {label:"GASTOS",   value:totalGastos,   color:"#ef4444"},
                {label:"BALANCE",  value:balance,       color:balance>=0?"#10b981":"#ef4444"},
              ].map(card=>(
                <div key={card.label} style={{background:"#1a1f2e",border:"1px solid #1e2a3a",borderLeft:`3px solid ${card.color}`,borderRadius:12,padding:"18px 22px"}}>
                  <div style={{fontSize:9,color:"#64748b",letterSpacing:"2px",fontWeight:600,marginBottom:8}}>{card.label}</div>
                  <div style={{fontSize:22,fontWeight:700,color:card.color,letterSpacing:"-1px"}}>
                    {card.label==="BALANCE"&&balance<0?"-":""}{formatCRC(card.value)}
                  </div>
                </div>
              ))}
            </div>

            <div style={{background:"#1a1f2e",border:"1px solid #1e2a3a",borderRadius:12,padding:22,marginBottom:14}}>
              <div style={{fontSize:9,color:"#64748b",letterSpacing:"2px",fontWeight:600,marginBottom:18}}>GASTOS POR CATEGORÍA</div>
              {byCategory.length===0 && <div style={{color:"#475569",fontSize:13,textAlign:"center",padding:"20px 0"}}>Sin gastos este mes</div>}
              {byCategory.map(([cat,amt])=>(
                <div key={cat} style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                    <span style={{fontSize:12,color:"#cbd5e1"}}>{cat}</span>
                    <span style={{fontSize:12,color:"#ef4444",fontWeight:600}}>{formatCRC(amt)}</span>
                  </div>
                  <div style={{background:"#0f1117",borderRadius:4,height:5}}>
                    <div style={{height:"100%",borderRadius:4,background:"linear-gradient(90deg,#ef4444,#f97316)",width:`${(amt/maxCat)*100}%`,transition:"width 0.4s"}}/>
                  </div>
                </div>
              ))}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
              {Object.entries(byTruck).map(([truck,data])=>{
                const tc=TRUCK_COLORS[truck];
                const bal=data.ingresos-data.gastos;
                return (
                  <div key={truck} style={{background:"#1a1f2e",border:`1px solid ${tc.border}`,borderTop:`3px solid ${tc.primary}`,borderRadius:12,padding:18}}>
                    <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:14}}>
                      <span style={{fontSize:15}}>{tc.icon}</span>
                      <span style={{fontSize:10,color:tc.text,fontWeight:700,letterSpacing:"1px"}}>{truck.toUpperCase()}</span>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:11,color:"#94a3b8"}}>Ingresos</span><span style={{fontSize:12,fontWeight:700,color:"#10b981"}}>{formatCRC(data.ingresos)}</span></div>
                      <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:11,color:"#94a3b8"}}>Gastos</span><span style={{fontSize:12,fontWeight:700,color:"#f87171"}}>{formatCRC(data.gastos)}</span></div>
                      <div style={{borderTop:`1px solid ${tc.border}`,paddingTop:8,display:"flex",justifyContent:"space-between"}}>
                        <span style={{fontSize:11,color:"#94a3b8",fontWeight:600}}>Balance</span>
                        <span style={{fontSize:13,fontWeight:700,color:bal>=0?"#10b981":"#f87171"}}>{bal<0?"-":""}{formatCRC(bal)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{background:"#1a1f2e",border:"1px solid #1e2a3a",borderRadius:12,padding:22}}>
              <div style={{fontSize:9,color:"#64748b",letterSpacing:"2px",fontWeight:600,marginBottom:16}}>ÚLTIMOS MOVIMIENTOS</div>
              {filtered.length===0 && <div style={{color:"#475569",fontSize:13,textAlign:"center",padding:"20px 0"}}>Sin movimientos este mes</div>}
              {filtered.slice(0,5).map(r=>{
                const tc=TRUCK_COLORS[r.truck]||TRUCK_COLORS["General"];
                const ucc=USER_COLORS[r.createdBy]||{color:"#94a3b8"};
                return (
                  <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #1e2a3a"}}>
                    <div style={{display:"flex",flexDirection:"column",gap:3}}>
                      <span style={{fontSize:12,color:"#e2e8f0"}}>{r.description}</span>
                      <div style={{display:"flex",gap:8}}>
                        <span style={{fontSize:10,color:tc.text}}>{tc.icon} {r.truck}</span>
                        <span style={{fontSize:10,color:ucc.color}}>· {r.createdBy}</span>
                        <span style={{fontSize:10,color:"#475569"}}>· {r.date}</span>
                      </div>
                    </div>
                    <span style={{fontSize:13,fontWeight:700,color:r.type==="ingreso"?"#10b981":"#ef4444",marginLeft:16}}>
                      {r.type==="ingreso"?"+":"-"}{formatCRC(r.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══ MOVIMIENTOS ══ */}
        {view==="movimientos" && (
          <div>
            <div style={{display:"flex",gap:6,marginBottom:14}}>
              {[["todos","Todos"],["ingreso","Ingresos"],["gasto","Gastos"]].map(([v,l])=>(
                <button key={v} onClick={()=>setFilterType(v)} style={{
                  background:filterType===v?"#f59e0b":"#1e2a3a",
                  color:filterType===v?"#000":"#94a3b8",
                  border:"1px solid",borderColor:filterType===v?"#f59e0b":"#2d3748",
                  borderRadius:6,padding:"6px 14px",fontSize:12,fontWeight:600,
                  cursor:"pointer",fontFamily:"inherit"
                }}>{l}</button>
              ))}
            </div>

            <div style={{background:"#1a1f2e",border:"1px solid #1e2a3a",borderRadius:12,overflow:"hidden"}}>
              {filtered.length===0 && <div style={{color:"#475569",fontSize:13,textAlign:"center",padding:"40px 0"}}>Sin movimientos para este filtro</div>}
              {filtered.map((r,i)=>{
                const tc=TRUCK_COLORS[r.truck]||TRUCK_COLORS["General"];
                const ucc=USER_COLORS[r.createdBy]||{color:"#94a3b8"};
                const ucu=r.updatedBy ? (USER_COLORS[r.updatedBy]||{color:"#94a3b8"}) : null;
                return (
                  <div key={r.id} style={{
                    display:"flex",alignItems:"flex-start",justifyContent:"space-between",
                    padding:"14px 18px",
                    borderBottom:i<filtered.length-1?"1px solid #1e2a3a":"none",
                    borderLeft:`3px solid ${tc.primary}`,
                    gap:12,flexWrap:"wrap"
                  }}>
                    <div style={{flex:1,display:"flex",flexDirection:"column",gap:5}}>
                      <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                        <span style={{fontSize:13,fontWeight:600,color:"#f1f5f9"}}>{r.description}</span>
                        {r.type==="gasto"
                          ? <Pill color="#fca5a5" bg="rgba(239,68,68,0.12)" border="rgba(239,68,68,0.25)">{r.category}</Pill>
                          : <Pill color="#6ee7b7" bg="rgba(16,185,129,0.12)" border="rgba(16,185,129,0.25)">{r.grain}</Pill>
                        }
                        <Pill color={tc.text} bg={tc.bg} border={tc.border}>{tc.icon} {r.truck}</Pill>
                      </div>
                      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                        <span style={{fontSize:10,color:"#475569"}}>{r.date}</span>
                        <span style={{fontSize:10,color:ucc.color}}>✦ {r.createdBy} · {r.createdAt}</span>
                        {ucu && r.updatedBy && (
                          <span style={{fontSize:10,color:ucu.color}}>✎ Editado: {r.updatedBy} · {r.updatedAt}</span>
                        )}
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:7,flexShrink:0}}>
                      <span style={{fontSize:14,fontWeight:700,color:r.type==="ingreso"?"#10b981":"#ef4444"}}>
                        {r.type==="ingreso"?"+":"-"}{formatCRC(r.amount)}
                      </span>
                      <button onClick={()=>{ setEditRecord(r); setShowForm(true); }} style={{
                        background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.25)",
                        color:"#f59e0b",borderRadius:6,padding:"5px 9px",fontSize:12,
                        cursor:"pointer",fontFamily:"inherit",fontWeight:600
                      }}>✏️</button>
                      <button onClick={()=>setDeleteId(r.id)} style={{
                        background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",
                        color:"#ef4444",borderRadius:6,padding:"5px 9px",fontSize:12,
                        cursor:"pointer",fontFamily:"inherit",fontWeight:600
                      }}>✕</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {filtered.length>0 && (
              <div style={{marginTop:10,background:"#1a1f2e",border:"1px solid #1e2a3a",borderRadius:8,padding:"11px 18px",display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
                <span style={{fontSize:11,color:"#64748b",fontWeight:600}}>{filtered.length} registros · {MONTHS[filterMonth]} {filterYear}</span>
                <div style={{display:"flex",gap:16}}>
                  <span style={{fontSize:12,color:"#10b981",fontWeight:700}}>+{formatCRC(totalIngresos)}</span>
                  <span style={{fontSize:12,color:"#ef4444",fontWeight:700}}>-{formatCRC(totalGastos)}</span>
                  <span style={{fontSize:12,color:balance>=0?"#10b981":"#ef4444",fontWeight:700}}>{balance<0?"-":""}{formatCRC(balance)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ AUDITORÍA ══ */}
        {view==="auditoria" && (
          <div>
            <div style={{background:"#1a1f2e",border:"1px solid #1e2a3a",borderRadius:12,padding:22,marginBottom:16}}>
              <div style={{fontSize:9,color:"#64748b",letterSpacing:"2px",fontWeight:600,marginBottom:4}}>REGISTRO DE CAMBIOS</div>
              <div style={{fontSize:12,color:"#475569",marginBottom:20}}>Cada acción queda registrada con usuario, fecha y hora.</div>
              {auditLog.length===0 && <div style={{color:"#475569",fontSize:13,textAlign:"center",padding:"30px 0"}}>Sin registros todavía. Las acciones aparecerán aquí.</div>}
              {auditLog.map((entry,i)=>{
                const ucc=USER_COLORS[entry.usuario]||{color:"#94a3b8"};
                const actionColor=entry.accion==="CREÓ"?"#10b981":entry.accion==="EDITÓ"?"#f59e0b":"#ef4444";
                return (
                  <div key={i} style={{display:"flex",gap:12,padding:"12px 0",borderBottom:i<auditLog.length-1?"1px solid #1e2a3a":"none",alignItems:"flex-start"}}>
                    <div style={{
                      flexShrink:0,width:64,fontSize:10,fontWeight:700,
                      color:actionColor,background:`${actionColor}18`,border:`1px solid ${actionColor}33`,
                      borderRadius:6,padding:"3px 0",textAlign:"center"
                    }}>{entry.accion}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,color:"#e2e8f0",marginBottom:4}}>{entry.descripcion}</div>
                      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                        <span style={{fontSize:10,color:ucc.color,fontWeight:700}}>{entry.usuario}</span>
                        <span style={{fontSize:10,color:"#475569"}}>{entry.fecha}</span>
                        <span style={{fontSize:10,color:"#64748b"}}>{entry.monto}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {!sheetsConfigured && (
              <div style={{background:"#1a1f2e",border:"1px solid rgba(245,158,11,0.3)",borderRadius:12,padding:22}}>
                <div style={{fontSize:11,color:"#f59e0b",fontWeight:700,marginBottom:14}}>⚙️ CÓMO CONECTAR CON GOOGLE SHEETS</div>
                {[
                  ["1","Ir a sheets.google.com → crear hoja llamada \"TransporteGranos\""],
                  ["2","Crear dos pestañas: \"Movimientos\" y \"Auditoría\""],
                  ["3","En la pestaña Movimientos, agregar encabezados en fila 1: ID | Tipo | Fecha | Categoría | Camión | Grano | Monto | Descripción | CreadoPor | CreadoEn | EditadoPor | EditadoEn"],
                  ["4","Ir a console.cloud.google.com → crear proyecto → habilitar Google Sheets API"],
                  ["5","En Credenciales → crear API Key"],
                  ["6","Copiar el Spreadsheet ID (está en la URL de tu hoja de cálculo)"],
                  ["7","Pegar el Spreadsheet ID y la API Key en las líneas SHEET_ID y API_KEY al inicio del código"],
                ].map(([n,txt])=>(
                  <div key={n} style={{display:"flex",gap:12,marginBottom:10,alignItems:"flex-start"}}>
                    <span style={{flexShrink:0,width:22,height:22,background:"rgba(245,158,11,0.15)",color:"#f59e0b",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700}}>{n}</span>
                    <span style={{fontSize:11,color:"#94a3b8",lineHeight:1.7}}>{txt}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal cambio de contraseña */}
      {showPwdChange && (
        <ChangePasswordModal
          user={user}
          credentials={credentials}
          onSave={handlePasswordChange}
          onClose={()=>setShowPwdChange(false)}
        />
      )}

      {/* Modal formulario */}
      {showForm && (
        <RecordModal
          user={user}
          initial={editRecord}
          onSave={handleSave}
          onClose={()=>{ setShowForm(false); setEditRecord(null); }}
        />
      )}

      {/* Confirm eliminar */}
      {deleteId && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:16}}>
          <div style={{background:"#1a1f2e",border:"1px solid #ef4444",borderRadius:16,padding:28,maxWidth:360,width:"100%",textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:12}}>⚠️</div>
            <div style={{fontSize:15,fontWeight:600,color:"#f1f5f9",marginBottom:8}}>¿Eliminar movimiento?</div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:24}}>Quedará registrado en Auditoría quién lo eliminó y cuándo.</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setDeleteId(null)} style={{flex:1,background:"#2d3748",border:"none",color:"#94a3b8",borderRadius:8,padding:"11px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Cancelar</button>
              <button onClick={()=>handleDelete(deleteId)} style={{flex:1,background:"#ef4444",border:"none",color:"#fff",borderRadius:8,padding:"11px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
