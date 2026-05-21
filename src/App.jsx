import { useState, useEffect, useRef } from 'react'
import COUNTRIES from './countries.js'
import FLAG_PIXELS, { FLAG_META } from './flagPixels.js'

const { w: PW, h: PH } = FLAG_META

// ── helpers ───────────────────────────────────────────────────────────────────

function getTodayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function getDateStr(offset) {
  const d = new Date(); d.setDate(d.getDate()+offset)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function getDailyCountry(dateStr) {
  let h = 0
  for (let i = 0; i < dateStr.length; i++) h = (h*31+dateStr.charCodeAt(i))>>>0
  return COUNTRIES[h % COUNTRIES.length]
}
function formatDate(dateStr) {
  const [y,m,d] = dateStr.split('-')
  const months = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre']
  return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`
}
function getTimeToMidnight() {
  const now = new Date(), midnight = new Date(now); midnight.setHours(24,0,0,0)
  const diff = midnight-now
  const h=Math.floor(diff/3600000),m=Math.floor((diff%3600000)/60000),s=Math.floor((diff%60000)/1000)
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

// Archivio: dal giorno -7 fino a ieri, cresce ogni giorno
function getArchiveDates() {
  const dates = []
  // Calcola quanti giorni fa è partito l'archivio (fisso al 7 maggio 2026 = lancio - 7gg)
  // In realtà: sempre da -7 a -1 rispetto a oggi → cresce automaticamente ogni giorno
  for (let i = -7; i <= -1; i++) dates.push(getDateStr(i))
  return dates.reverse() // più recente prima
}

// ── pixel logic ───────────────────────────────────────────────────────────────

function computeOverlapMask(targetCode, guessCode) {
  const tb = FLAG_PIXELS[targetCode]
  const gb = FLAG_PIXELS[guessCode]
  if (!tb || !gb) return new Uint8Array(PW*PH)
  const mask = new Uint8Array(PW*PH)
  for (let i=0;i<PW*PH;i++) {
    if (tb[i]==='T'||gb[i]==='T') continue
    if (tb[i]===gb[i]) mask[i]=1
  }
  return mask
}

function computeRevealMask(targetCode, guesses) {
  const mask = new Uint8Array(PW*PH)
  guesses.forEach(g => {
    const m = computeOverlapMask(targetCode, g.code)
    for (let i=0;i<mask.length;i++) if (m[i]) mask[i]=1
  })
  return mask
}

function countRevealed(targetCode, mask) {
  const tb = FLAG_PIXELS[targetCode]
  if (!tb) return {revealed:0,total:1}
  let revealed=0, total=0
  for (let i=0;i<tb.length;i++) {
    if (tb[i]==='T') continue
    total++
    if (mask[i]) revealed++
  }
  return {revealed, total}
}

function revealPct(targetCode, mask) {
  const {revealed, total} = countRevealed(targetCode, mask)
  return Math.round(revealed/total*100)
}

// Colori bucket sbloccati da un tentativo (nuovi rispetto a maschera precedente)
const BUCKET_LABEL = {
  W:'bianco', K:'nero', G:'grigio', R:'rosso', M:'bordeaux',
  O:'arancione', Y:'giallo', V:'verde', C:'celeste', B:'blu', P:'viola'
}
const BUCKET_HEX = {
  W:'#f0f0f0', K:'#2a2a2a', G:'#888', R:'#cc2020', M:'#8b1a3a',
  O:'#e06000', Y:'#e8c000', V:'#1a7a1a', C:'#0090c0', B:'#1040a0', P:'#7020a0'
}

function getNewBuckets(targetCode, guessCode, prevMask) {
  const tb = FLAG_PIXELS[targetCode]
  const gb = FLAG_PIXELS[guessCode]
  if (!tb || !gb) return []
  const newBuckets = new Set()
  for (let i=0;i<PW*PH;i++) {
    if (tb[i]==='T'||gb[i]==='T') continue
    if (tb[i]===gb[i] && !prevMask[i]) newBuckets.add(tb[i])
  }
  return [...newBuckets]
}

// ── canvas rendering ──────────────────────────────────────────────────────────

const imgCache = {}
function loadFlagImage(code) {
  if (imgCache[code]) return imgCache[code]
  const p = new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = `https://cdn.jsdelivr.net/npm/flag-icons@7.2.3/flags/4x3/${code}.svg`
  })
  imgCache[code] = p
  return p
}

function FlagCanvas({ targetCode, mask, isDark, done, width=300, height=200 }) {
  const canvasRef = useRef(null)
  const offRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const tb = FLAG_PIXELS[targetCode]
    if (!tb) return

    ctx.fillStyle = isDark ? '#1a1a1a' : '#cccccc'
    ctx.fillRect(0, 0, width, height)

    loadFlagImage(targetCode).then(img => {
      if (done) {
        ctx.drawImage(img, 0, 0, width, height)
        return
      }
      if (!offRef.current) {
        offRef.current = document.createElement('canvas')
        offRef.current.width = PW
        offRef.current.height = PH
      }
      const oCtx = offRef.current.getContext('2d')
      oCtx.clearRect(0, 0, PW, PH)
      oCtx.drawImage(img, 0, 0, PW, PH)
      const imageData = oCtx.getImageData(0, 0, PW, PH)
      const data = imageData.data
      const outData = ctx.createImageData(width, height)
      const out = outData.data
      const scaleX = PW/width, scaleY = PH/height
      const bg = isDark ? 26 : 204
      for (let y=0;y<height;y++) {
        for (let x=0;x<width;x++) {
          const bx = Math.min(Math.floor(x*scaleX), PW-1)
          const by = Math.min(Math.floor(y*scaleY), PH-1)
          const bi = by*PW+bx
          const oi = (y*width+x)*4
          if (mask[bi]) {
            const si = bi*4
            out[oi]=data[si]; out[oi+1]=data[si+1]; out[oi+2]=data[si+2]; out[oi+3]=255
          } else {
            out[oi]=bg; out[oi+1]=bg; out[oi+2]=bg; out[oi+3]=255
          }
        }
      }
      ctx.putImageData(outData, 0, 0)
    }).catch(()=>{})
  }, [targetCode, mask, isDark, done, width, height])

  const pct = done ? 100 : revealPct(targetCode, mask)

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,width:'100%'}}>
      <canvas ref={canvasRef} width={width} height={height}
        style={{borderRadius:6,border:`1.5px solid rgba(128,128,128,0.25)`,display:'block',maxWidth:'100%'}}/>
      {!done && (
        <>
          <div style={{width:'100%',maxWidth:width,height:3,background:'rgba(128,128,128,0.15)',borderRadius:2,overflow:'hidden'}}>
            <div style={{height:'100%',width:`${pct}%`,background:'#538d4e',transition:'width 0.4s',borderRadius:2}}/>
          </div>
          <div style={{fontSize:11,color:'rgba(128,128,128,0.5)'}}>{pct}% rivelato</div>
        </>
      )}
    </div>
  )
}

// ── storage ───────────────────────────────────────────────────────────────────

const STORAGE_PREFIX = 'flagle5_'
const THEME_KEY = 'flagle_theme'
const MAX_ATTEMPTS = 6

function loadGame(dateStr){try{return JSON.parse(localStorage.getItem(STORAGE_PREFIX+dateStr))||null}catch{return null}}
function saveGame(dateStr,g){try{localStorage.setItem(STORAGE_PREFIX+dateStr,JSON.stringify(g))}catch{}}
function initGame(dateStr){return loadGame(dateStr)||{guesses:[],done:false,won:false}}

const KEYBOARD_ROWS=[
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['INVIO','Z','X','C','V','B','N','M','⌫'],
]

// ── GameBoard ─────────────────────────────────────────────────────────────────

function GameBoard({dateStr, onBack, isDark, C, isToday, countdown}) {
  const country = getDailyCountry(dateStr)
  const [game, setGame] = useState(()=>initGame(dateStr))
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [activeSug, setActiveSug] = useState(-1)
  const [shake, setShake] = useState(false)
  const inputRef = useRef(null)
  const acRef = useRef(null)

  useEffect(()=>{saveGame(dateStr,game)},[game])

  useEffect(()=>{
    const val=input.trim().toLowerCase()
    if(!val){setSuggestions([]);return}
    setSuggestions(COUNTRIES.filter(c=>c.name.toLowerCase().startsWith(val)||c.name.toLowerCase().includes(val)).slice(0,6))
    setActiveSug(-1)
  },[input])

  useEffect(()=>{
    const h=e=>{if(acRef.current&&!acRef.current.contains(e.target)&&e.target!==inputRef.current)setSuggestions([])}
    document.addEventListener('mousedown',h); return()=>document.removeEventListener('mousedown',h)
  },[])

  useEffect(()=>{
    const h=e=>{
      if(game.done)return
      if(e.key==='Enter'){e.preventDefault();handleConfirm();return}
      if(e.key==='Backspace'){setInput(v=>v.slice(0,-1));return}
      if(e.key==='Escape'){setSuggestions([]);return}
      if(e.key==='ArrowDown'){e.preventDefault();setActiveSug(i=>Math.min(i+1,suggestions.length-1));return}
      if(e.key==='ArrowUp'){e.preventDefault();setActiveSug(i=>Math.max(i-1,0));return}
    }
    window.addEventListener('keydown',h); return()=>window.removeEventListener('keydown',h)
  },[game.done,suggestions,activeSug,input])

  function submitGuess(c) {
    if(game.done)return
    if(game.guesses.find(g=>g.code===c.code)){setShake(true);setTimeout(()=>setShake(false),500);return}
    const won=c.code===country.code
    const newGuesses=[...game.guesses,{name:c.name,code:c.code}]
    const done=won||newGuesses.length>=MAX_ATTEMPTS
    setGame(g=>({...g,guesses:newGuesses,done,won}))
    setInput('');setSuggestions([]);setActiveSug(-1)
  }

  function handleConfirm() {
    if(activeSug>=0&&suggestions[activeSug]){submitGuess(suggestions[activeSug]);return}
    if(suggestions.length===1){submitGuess(suggestions[0]);return}
    const exact=COUNTRIES.find(c=>c.name.toLowerCase()===input.trim().toLowerCase())
    if(exact)submitGuess(exact)
    else{setShake(true);setTimeout(()=>setShake(false),500)}
  }

  function handleKey(k) {
    if(game.done)return
    if(k==='⌫'){setInput(v=>v.slice(0,-1));return}
    if(k==='INVIO'){handleConfirm();return}
    setInput(v=>v+k.toLowerCase());inputRef.current?.focus()
  }

  const revealMask = computeRevealMask(country.code, game.guesses)
  const totalPct = revealPct(country.code, revealMask)

  // Pre-calcola maschere cumulative per ogni tentativo
  const cumulativeMasks = game.guesses.map((_, i) =>
    computeRevealMask(country.code, game.guesses.slice(0, i))
  )

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',width:'100%',maxWidth:480,margin:'0 auto',padding:'0 12px'}}>

      {/* Sub-header */}
      <div style={{width:'100%',display:'flex',alignItems:'center',padding:'8px 0',borderBottom:`1px solid ${C.headerBorder}`,marginBottom:12}}>
        {!isToday&&<button onClick={onBack} style={{background:'none',border:'none',cursor:'pointer',color:C.textSecondary,fontSize:20,padding:'0 8px 0 0'}}>←</button>}
        <div style={{flex:1,textAlign:'center'}}>
          <span style={{fontSize:13,color:'#f5a623',fontWeight:600}}>{formatDate(dateStr)}</span>
          {!isToday&&<span style={{fontSize:11,color:C.textMuted,marginLeft:8}}>Archivio</span>}
        </div>
      </div>

      {/* Bandiera */}
      <div style={{animation:shake?'shake 0.5s':'none',width:'100%',marginBottom:8}}>
        <FlagCanvas targetCode={country.code} mask={revealMask} isDark={isDark} done={game.done} width={456} height={304}/>
        {game.done && (
          <div style={{textAlign:'center',fontSize:12,color:C.textMuted,marginTop:6}}>
            {game.won ? `✓ ${country.name}` : `Risposta: ${country.name}`}
          </div>
        )}
      </div>

      {/* Tentativi */}
      <div style={{width:'100%',display:'flex',flexDirection:'column',gap:5,marginBottom:8}}>
        {Array.from({length:MAX_ATTEMPTS},(_,i)=>{
          const g = game.guesses[i]
          const isCorrect = g && g.code===country.code

          // % rivelata da questo tentativo (nuovi pixel)
          let addedPct = 0
          let newBuckets = []
          if (g && !isCorrect) {
            const prevMask = cumulativeMasks[i]
            const thisMask = computeOverlapMask(country.code, g.code)
            let newPx = 0
            const tb = FLAG_PIXELS[country.code]
            let total = 0
            if (tb) for (let j=0;j<tb.length;j++) if(tb[j]!=='T') total++
            for (let j=0;j<thisMask.length;j++) if(thisMask[j]&&!prevMask[j]) newPx++
            addedPct = total > 0 ? Math.round(newPx/total*100) : 0
            newBuckets = getNewBuckets(country.code, g.code, prevMask)
          }

          return (
            <div key={i} style={{display:'flex',alignItems:'center',gap:6}}>
              <div style={{width:16,fontSize:10,color:C.textMuted,textAlign:'right',flexShrink:0}}>{i+1}</div>

              {/* Bandierina */}
              {g ? (
                <div style={{width:44,height:30,borderRadius:3,flexShrink:0,overflow:'hidden',border:`1.5px solid ${isCorrect?C.cellCorrect:C.cellWrong}`}}>
                  <span className={`fi fi-${g.code}`} style={{width:'100%',height:'100%',backgroundSize:'cover',backgroundPosition:'center',display:'block'}}/>
                </div>
              ) : (
                <div style={{width:44,height:30,borderRadius:3,flexShrink:0,border:`1.5px solid ${C.cellEmptyBorder}`,background:C.cellEmpty}}/>
              )}

              {/* Nome */}
              <div style={{flex:1,height:30,borderRadius:3,border:`1.5px solid ${g?(isCorrect?C.cellCorrect:C.cellWrong):C.cellEmptyBorder}`,background:g?(isCorrect?C.cellCorrect:C.cellWrong):C.cellEmpty,display:'flex',alignItems:'center',paddingLeft:8,fontSize:12,fontWeight:600,color:g?'#fff':C.textMuted,overflow:'hidden'}}>
                {g?g.name:''}
              </div>

              {/* % + colori */}
              {g && !isCorrect && (
                <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:3,flexShrink:0,minWidth:72}}>
                  <span style={{fontSize:11,fontWeight:700,color:addedPct>=10?C.accent:addedPct>0?C.textSecondary:C.textMuted}}>
                    {addedPct>0?`+${addedPct}%`:'nessuno'}
                  </span>
                  {newBuckets.length>0&&(
                    <div style={{display:'flex',gap:2,flexWrap:'wrap',justifyContent:'flex-end'}}>
                      {newBuckets.map(b=>(
                        <div key={b} title={BUCKET_LABEL[b]||b}
                          style={{width:10,height:10,borderRadius:2,background:BUCKET_HEX[b]||'#888',border:'1px solid rgba(255,255,255,0.15)',flexShrink:0}}/>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {g&&isCorrect&&<span style={{fontSize:15,marginLeft:4}}>✓</span>}
            </div>
          )
        })}
      </div>

      {/* Counter */}
      <div style={{fontSize:11,color:C.textSecondary,marginBottom:8,textAlign:'center'}}>
        {game.done
          ? (game.won?`Indovinato in ${game.guesses.length}/${MAX_ATTEMPTS} — ${totalPct}% rivelato`:`Fine tentativi — ${totalPct}% rivelato`)
          : `${game.guesses.length}/${MAX_ATTEMPTS}`}
      </div>

      {/* Input */}
      {!game.done&&(
        <div style={{position:'relative',width:'100%',marginBottom:8}}>
          <input ref={inputRef} type="text" value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{
              if(e.key==='Enter'){e.preventDefault();handleConfirm()}
              if(e.key==='ArrowDown'){e.preventDefault();setActiveSug(i=>Math.min(i+1,suggestions.length-1))}
              if(e.key==='ArrowUp'){e.preventDefault();setActiveSug(i=>Math.max(i-1,0))}
              if(e.key==='Escape')setSuggestions([])
            }}
            placeholder="Scrivi il paese..." autoComplete="off"
            style={{width:'100%',padding:'10px 14px',fontSize:14,borderRadius:6,border:`1.5px solid ${C.inputBorder}`,background:C.inputBg,color:C.text,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}
          />
          {suggestions.length>0&&(
            <div ref={acRef} style={{position:'absolute',bottom:'calc(100% + 4px)',left:0,right:0,background:C.acBg,border:`1px solid ${C.acBorder}`,borderRadius:6,zIndex:20,overflow:'hidden',boxShadow:'0 4px 12px rgba(0,0,0,0.3)'}}>
              {suggestions.map((c,i)=>(
                <div key={c.code} onMouseDown={e=>{e.preventDefault();submitGuess(c)}}
                  style={{padding:'10px 14px',fontSize:13,cursor:'pointer',color:C.text,background:i===activeSug?C.acHover:'transparent',borderBottom:`1px solid ${C.acBorder}`}}>
                  {c.name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Banner fine partita */}
      {game.done&&(
        <div style={{width:'100%',background:C.resultBg,border:`1px solid ${C.headerBorder}`,borderRadius:10,padding:'16px',textAlign:'center',marginBottom:8}}>
          <div style={{fontSize:20,fontWeight:700,marginBottom:8}}>
            {game.won?`🎉 Indovinato in ${game.guesses.length}/${MAX_ATTEMPTS}!`:'❌ Fine tentativi'}
          </div>
          {/* Bandiera reale grande */}
          <div style={{display:'flex',justifyContent:'center',marginBottom:10}}>
            <div style={{width:160,height:107,borderRadius:6,overflow:'hidden',border:`1.5px solid ${C.headerBorder}`}}>
              <span className={`fi fi-${country.code}`} style={{width:'100%',height:'100%',backgroundSize:'cover',backgroundPosition:'center',display:'block'}}/>
            </div>
          </div>
          <div style={{fontSize:16,fontWeight:600,color:C.text,marginBottom:4}}>{country.name}</div>
          <div style={{fontSize:12,color:C.textSecondary,marginBottom:12}}>{totalPct}% della bandiera rivelato</div>

          {isToday&&countdown&&(
            <div style={{paddingTop:10,borderTop:`1px solid ${C.headerBorder}`,marginBottom:12}}>
              <div style={{fontSize:10,color:C.textSecondary,letterSpacing:1}}>PROSSIMA BANDIERA TRA</div>
              <div style={{fontSize:24,fontWeight:700,fontFamily:'monospace',letterSpacing:3,marginTop:2,color:C.text}}>{countdown}</div>
            </div>
          )}

          <button onClick={onBack||(() => {})}
            style={{padding:'10px 24px',background:C.accent,color:'#fff',border:'none',borderRadius:6,fontWeight:700,fontSize:14,cursor:'pointer',letterSpacing:0.5}}>
            {isToday ? '🗓 Vai all\'archivio' : '← Torna all\'archivio'}
          </button>
        </div>
      )}

      {/* Tastiera */}
      {!game.done&&(
        <div style={{width:'100%',maxWidth:480}}>
          {KEYBOARD_ROWS.map((row,ri)=>(
            <div key={ri} style={{display:'flex',justifyContent:'center',gap:4,marginBottom:4}}>
              {row.map(k=>(
                <button key={k} onClick={()=>handleKey(k)}
                  style={{flex:k==='INVIO'||k==='⌫'?1.5:1,maxWidth:k==='INVIO'||k==='⌫'?62:40,height:50,borderRadius:4,border:'none',background:k==='INVIO'||k==='⌫'?C.keySpecialBg:C.keyBg,color:C.keyText,fontSize:k==='INVIO'?10:15,fontWeight:700,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  {k}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const todayStr = getTodayStr()
  const [tab, setTab] = useState('game')
  const [archiveDate, setArchiveDate] = useState(null)
  const [theme, setTheme] = useState(()=>localStorage.getItem(THEME_KEY)||'dark')
  const [,forceUpdate] = useState(0)
  const [countdown, setCountdown] = useState(getTimeToMidnight())

  useEffect(()=>{localStorage.setItem(THEME_KEY,theme)},[theme])
  useEffect(()=>{const id=setInterval(()=>setCountdown(getTimeToMidnight()),1000);return()=>clearInterval(id)},[])

  // Quando si clicca "Vai all'archivio" dal gioco del giorno
  function goToArchive() { setTab('archive'); setArchiveDate(null) }

  const isDark = theme==='dark'
  const C = {
    pageBg:isDark?'#121213':'#f5f5f5',
    headerBorder:isDark?'#3a3a3c':'#d3d6da',
    text:isDark?'#ffffff':'#1a1a1b',
    textSecondary:isDark?'#818384':'#787c7e',
    textMuted:isDark?'#565758':'#aaa',
    cellEmpty:isDark?'#1e1e1e':'#ffffff',
    cellEmptyBorder:isDark?'#3a3a3c':'#d3d6da',
    cellCorrect:'#538d4e',
    cellWrong:isDark?'#3a3a3c':'#878a8c',
    keyBg:isDark?'#818384':'#d3d6da',
    keySpecialBg:isDark?'#565758':'#aaa',
    keyText:'#ffffff',
    acBg:isDark?'#1e1e1e':'#fff',
    acBorder:isDark?'#3a3a3c':'#d3d6da',
    acHover:isDark?'#2a2a2b':'#f0f0f0',
    inputBg:isDark?'#1e1e1e':'#fff',
    inputBorder:isDark?'#565758':'#d3d6da',
    accent:'#538d4e',
    resultBg:isDark?'#1a1a1b':'#ffffff',
  }

  const archiveDates = getArchiveDates()
  const allDates = [todayStr,...archiveDates]
  const played = allDates.map(d=>loadGame(d)).filter(g=>g?.done)
  const wins = played.filter(g=>g.won).length
  const total = played.length
  let maxStreak=0,cur=0,streak=0
  allDates.forEach(d=>{const g=loadGame(d);if(g?.done&&g?.won){cur++;if(cur>maxStreak)maxStreak=cur;streak=cur}else cur=0})
  const dist=Array(MAX_ATTEMPTS).fill(0)
  played.filter(g=>g.won).forEach(g=>{const a=g.guesses?.length;if(a>=1&&a<=MAX_ATTEMPTS)dist[a-1]++})
  const distMax=Math.max(...dist,1)

  return (
    <div style={{minHeight:'100vh',background:C.pageBg,color:C.text,fontFamily:"'Clear Sans','Helvetica Neue',Arial,sans-serif",display:'flex',flexDirection:'column'}}>

      {/* Header */}
      <div style={{borderBottom:`1px solid ${C.headerBorder}`,padding:'0 16px',flexShrink:0}}>
        <div style={{maxWidth:480,margin:'0 auto',display:'flex',alignItems:'center',height:52}}>
          <div style={{width:40}}>
            <button onClick={()=>setTab('howto')} style={{background:'none',border:'none',cursor:'pointer',color:C.textSecondary,fontSize:20,padding:4}}>?</button>
          </div>
          <div style={{flex:1,textAlign:'center'}}>
            <div style={{fontSize:17,fontWeight:700,letterSpacing:2,color:C.text}}>🎨 FLAGLE DAILY</div>
            <div style={{fontSize:10,color:'#f5a623',letterSpacing:1}}>{formatDate(todayStr)}</div>
          </div>
          <div style={{width:40,display:'flex',justifyContent:'flex-end',gap:4}}>
            <button onClick={()=>setTheme(t=>t==='dark'?'light':'dark')} style={{background:'none',border:'none',cursor:'pointer',fontSize:17,padding:4}}>{isDark?'☀️':'🌙'}</button>
          </div>
        </div>
        {/* Nav tabs */}
        <div style={{maxWidth:480,margin:'0 auto',display:'flex',borderTop:`1px solid ${C.headerBorder}`}}>
          {[['game','🎮 Gioca'],['archive','🗓 Archivio'],['stats','📊 Stats']].map(([id,label])=>(
            <button key={id} onClick={()=>{setTab(id);if(id==='archive')setArchiveDate(null)}}
              style={{flex:1,padding:'8px 4px',fontSize:12,fontWeight:tab===id?700:400,background:'none',border:'none',cursor:'pointer',color:tab===id?C.text:C.textMuted,borderBottom:tab===id?`2px solid ${C.accent}`:'2px solid transparent',transition:'color 0.15s'}}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* GAME */}
      {tab==='game'&&(
        <GameBoard dateStr={todayStr} onBack={goToArchive} isDark={isDark} C={C} isToday={true} countdown={countdown}/>
      )}

      {/* STATS */}
      {tab==='stats'&&(
        <div style={{maxWidth:480,margin:'0 auto',width:'100%',padding:'20px 16px'}}>
          <div style={{fontSize:13,fontWeight:700,letterSpacing:2,textAlign:'center',marginBottom:16,color:C.textSecondary}}>STATISTICHE</div>
          {total===0?<p style={{textAlign:'center',color:C.textMuted,fontSize:14}}>Nessuna partita ancora giocata.</p>:(
            <>
              <div style={{display:'flex',justifyContent:'center',gap:12,marginBottom:24}}>
                {[{n:total,l:'Partite'},{n:Math.round(wins/total*100)+'%',l:'Vittorie'},{n:streak,l:'Serie att.'},{n:maxStreak,l:'Max serie'}].map(({n,l})=>(
                  <div key={l} style={{textAlign:'center',minWidth:64,padding:'12px 8px',background:C.cellEmpty,borderRadius:8,border:`1px solid ${C.headerBorder}`}}>
                    <div style={{fontSize:28,fontWeight:500,color:C.text}}>{n}</div>
                    <div style={{fontSize:10,color:C.textSecondary,marginTop:2}}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{fontSize:12,fontWeight:700,letterSpacing:1,marginBottom:10,color:C.textSecondary}}>DISTRIBUZIONE TENTATIVI</div>
              {dist.map((v,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                  <div style={{fontSize:13,color:C.textSecondary,width:14,textAlign:'right',flexShrink:0}}>{i+1}</div>
                  <div style={{flex:1,height:22,background:isDark?'#2a2a2b':'#e0e0e0',borderRadius:4,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${Math.max(v/distMax*100,v>0?5:0)}%`,background:C.accent,borderRadius:4,display:'flex',alignItems:'center',justifyContent:'flex-end',paddingRight:6,transition:'width 0.4s'}}>
                      {v>0&&<span style={{fontSize:11,color:'#fff',fontWeight:700}}>{v}</span>}
                    </div>
                  </div>
                </div>
              ))}
              <div style={{textAlign:'center',marginTop:20,paddingTop:16,borderTop:`1px solid ${C.headerBorder}`}}>
                <div style={{fontSize:10,color:C.textSecondary,letterSpacing:1}}>PROSSIMA BANDIERA TRA</div>
                <div style={{fontSize:26,fontWeight:700,fontFamily:'monospace',letterSpacing:3,marginTop:4}}>{countdown}</div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ARCHIVE LIST */}
      {tab==='archive'&&archiveDate===null&&(
        <div style={{maxWidth:480,margin:'0 auto',width:'100%',padding:'16px'}}>
          <div style={{fontSize:11,color:C.textMuted,textAlign:'center',marginBottom:12}}>
            {archiveDates.length} bandiere disponibili · cresce ogni giorno
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {archiveDates.map(d=>{
              const c=getDailyCountry(d),g=loadGame(d)
              const done=g?.done,won=g?.won,att=g?.guesses?.length
              const pct = done ? revealPct(c.code, computeRevealMask(c.code, g.guesses||[])) : null
              return(
                <button key={d} onClick={()=>setArchiveDate(d)}
                  style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',borderRadius:8,border:`1px solid ${done?(won?C.accent:C.headerBorder):C.headerBorder}`,background:done?(won?(isDark?'#1a2e1a':'#f0f9ea'):(isDark?'#1e1e1e':'#f9f9f9')):(isDark?'#1e1e1e':'#f9f9f9'),cursor:'pointer',textAlign:'left',width:'100%',transition:'border-color 0.15s'}}>
                  <div style={{width:44,height:30,borderRadius:3,border:`1px solid ${C.headerBorder}`,overflow:'hidden',flexShrink:0,background:C.cellEmpty,display:'flex',alignItems:'center',justifyContent:'center'}}>
                    {done?<span className={`fi fi-${c.code}`} style={{width:'100%',height:'100%',backgroundSize:'cover',backgroundPosition:'center',display:'block'}}/>:<span style={{fontSize:18}}>🎨</span>}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:600,color:C.text}}>{done?c.name:'???'}</div>
                    <div style={{fontSize:11,color:C.textSecondary,marginTop:2}}>{formatDate(d)}</div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <div style={{fontSize:13,fontWeight:700,color:done?(won?C.accent:C.textMuted):C.textSecondary}}>
                      {done?(won?`${att}/${MAX_ATTEMPTS}`:'✗'):'Gioca →'}
                    </div>
                    {pct!==null&&<div style={{fontSize:10,color:C.textMuted,marginTop:2}}>{pct}% rivelato</div>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ARCHIVE GAME */}
      {tab==='archive'&&archiveDate!==null&&(
        <GameBoard dateStr={archiveDate} onBack={()=>{setArchiveDate(null);forceUpdate(n=>n+1)}} isDark={isDark} C={C} isToday={false} countdown={null}/>
      )}

      {/* HOW TO PLAY */}
      {tab==='howto'&&(
        <div style={{maxWidth:480,margin:'0 auto',width:'100%',padding:'20px 16px'}}>
          <div style={{fontSize:13,fontWeight:700,letterSpacing:2,textAlign:'center',marginBottom:20,color:C.textSecondary}}>COME SI GIOCA</div>
          <div style={{display:'flex',flexDirection:'column',gap:10,fontSize:14,color:C.textSecondary,lineHeight:1.7}}>
            {[
              ['🎨 Obiettivo',`Indovina la bandiera nascosta! Ogni tentativo rivela i pixel sovrapposti. Hai ${MAX_ATTEMPTS} tentativi.`],
              ['🔍 Come funziona','La bandiera parte completamente nascosta. Scrivi un paese: i pixel con lo stesso colore nella stessa posizione diventano visibili. Accanto ad ogni tentativo vedi la % di bandiera rivelata e i colori sbloccati.'],
              ['🧩 Strategia','Inizia con paesi con molti colori diversi (USA, Brasile, Sudafrica) per rivelare più zone. Poi usa quello che vedi per identificare la bandiera.'],
              ['🗓 Archivio','Le bandiere dei giorni precedenti sono sempre giocabili. Ogni giorno se ne aggiunge una nuova.'],
            ].map(([title,text])=>(
              <div key={title} style={{padding:'12px 14px',borderRadius:8,border:`1px solid ${C.headerBorder}`,background:C.cellEmpty}}>
                <strong style={{color:C.text,display:'block',marginBottom:4}}>{title}</strong>{text}
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
        *{box-sizing:border-box;}input::placeholder{color:#888;}button:focus{outline:none;}
      `}</style>
    </div>
  )
}


