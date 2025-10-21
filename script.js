const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

class Particle {
    constructor(x, y, locked = false) {
        this.position = { x, y };
        this.oldPosition = { x, y };
        this.locked = locked;
        this.forces = { x: 0, y: 0 };
        this.selected = false;
    }

    applyForce(x, y) { this.forces.x += x; this.forces.y += y; }

    update(dt = 1, gravity = 0.3) {
        if (this.locked) return;

        let vx = this.position.x - this.oldPosition.x;
        let vy = this.position.y - this.oldPosition.y;

        const friction = 0.975; // stronger damping for long structures
        vx *= friction;
        vy *= friction;

        // velocity limit to prevent runaway
        const maxVel = 50;
        if (vx > maxVel) vx = maxVel;
        if (vx < -maxVel) vx = -maxVel;
        if (vy > maxVel) vy = maxVel;
        if (vy < -maxVel) vy = -maxVel;

        const oldX = this.position.x;
        const oldY = this.position.y;

        this.position.x += vx + this.forces.x * dt * dt;
        this.position.y += vy + (this.forces.y + gravity) * dt * dt;

        this.oldPosition.x = oldX;
        this.oldPosition.y = oldY;

        this.forces.x = 0;
        this.forces.y = 0;
    }

    constrain() {
        const bounce = 0.5;
        const r = 5;
        if (this.position.x > canvas.width - r) {
            this.position.x = canvas.width - r;
            this.oldPosition.x = this.position.x + (this.position.x - this.oldPosition.x) * -bounce;
        }
        if (this.position.x < r) {
            this.position.x = r;
            this.oldPosition.x = this.position.x + (this.position.x - this.oldPosition.x) * -bounce;
        }
        if (this.position.y > canvas.height - r) {
            this.position.y = canvas.height - r;
            this.oldPosition.y = this.position.y + (this.position.y - this.oldPosition.y) * -bounce;
        }
        if (this.position.y < r) {
            this.position.y = r;
            this.oldPosition.y = this.position.y + (this.position.y - this.oldPosition.y) * -bounce;
        }
    }
}

class Stick {
    constructor(a, b, length = null) {
        this.a = a;
        this.b = b;
        this.length = length || Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
    }
    update() {
        const dx = this.b.position.x - this.a.position.x;
        const dy = this.b.position.y - this.a.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const diff = this.length - dist;
        const percent = diff / dist / 2;
        const offX = dx * percent;
        const offY = dy * percent;

        if (!this.a.locked) { this.a.position.x -= offX; this.a.position.y -= offY; }
        if (!this.b.locked) { this.b.position.x += offX; this.b.position.y += offY; }
    }
}

// === Canvas setup ===
function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// === Data ===
let particles = [];
let sticks = [];
let savedEditorState = null;
let selectedParticle = null;
let draggedParticle = null;
let mouse = { x: 0, y: 0, down: false };
let mode = "edit";

// === Helpers ===
function snapGrid(x, y) { const g = 25; return { x: Math.round(x/g)*g, y: Math.round(y/g)*g }; }

function createParticle(x, y, locked = true) {
    const {x: sx, y: sy} = snapGrid(x, y);
    // check if already exists nearby
    for (const p of particles) {
        if (Math.hypot(p.position.x - sx, p.position.y - sy) < 10) return null;
    }
    const p = new Particle(sx, sy, locked);
    particles.push(p);
    return p;
}

function createStick(a, b) {
    if (!a || !b || a === b) return null;
    // prevent duplicate
    for (const s of sticks) if ((s.a === a && s.b === b) || (s.a === b && s.b === a)) return null;
    const stick = new Stick(a, b);
    sticks.push(stick);
    return stick;
}

function deepCopyState() {
    const particleMap = new Map();
    const newParticles = particles.map(p => {
        const np = new Particle(p.position.x, p.position.y, p.locked);
        np.oldPosition = { ...p.oldPosition };
        particleMap.set(p, np);
        return np;
    });
    const newSticks = sticks.map(s => new Stick(particleMap.get(s.a), particleMap.get(s.b), s.length));
    return { particles: newParticles, sticks: newSticks };
}

function restoreState(state) {
    particles = state.particles.map(p => {
        const np = new Particle(p.position.x, p.position.y, p.locked);
        np.oldPosition = { ...p.oldPosition };
        return np;
    });
    const map = new Map(state.particles.map((p,i)=>[p,particles[i]]));
    sticks = state.sticks.map(s => new Stick(map.get(s.a), map.get(s.b), s.length));
}

// === Drawing ===
function drawGrid() {
    const g = 25;
    ctx.strokeStyle = "rgba(0,0,0,0.1)";
    ctx.lineWidth = 1;
    for(let x=0;x<canvas.width;x+=g){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}
    for(let y=0;y<canvas.height;y+=g){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}
}

function drawStick(s){ctx.beginPath();ctx.moveTo(s.a.position.x,s.a.position.y);ctx.lineTo(s.b.position.x,s.b.position.y);ctx.strokeStyle="#000";ctx.lineWidth=1.5;ctx.stroke();}
function drawPoint(p){ctx.beginPath();ctx.arc(p.position.x,p.position.y,5,0,Math.PI*2);ctx.fillStyle=p.selected?"blue":"black";ctx.fill();}

// === Simulation ===
function simulate() { for(const p of particles)p.update(1,0.3); for(let i=0;i<5;i++)for(const s of sticks)s.update(); for(const p of particles)p.constrain(); }

// === Main Loop ===
function animate(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if(mode==="edit") drawGrid();
    if(mode==="sim") simulate();
    for(const s of sticks) drawStick(s);
    for(const p of particles) drawPoint(p);
    ctx.fillStyle="rgba(0,0,0,0.6)";
    ctx.font="16px monospace";
    ctx.fillText(`Mode: ${mode.toUpperCase()} | Space=Sim/Reset | R=Edit | Ctrl+R=EditCurrent`,20,30);
    requestAnimationFrame(animate);
}
animate();

// === Mouse Handling ===
canvas.addEventListener("mousemove",e=>{mouse.x=e.clientX; mouse.y=e.clientY;
    if(draggedParticle && mode==="sim"){draggedParticle.position.x=mouse.x; draggedParticle.position.y=mouse.y;}
});
canvas.addEventListener("mousedown",e=>{
    mouse.down=true;
    const ctrl=e.ctrlKey, shift=e.shiftKey;
    let nearest=null,minDist=12;
    for(const p of particles){
        const dx=mouse.x-p.position.x, dy=mouse.y-p.position.y, d=Math.hypot(dx,dy);
        if(d<minDist){minDist=d; nearest=p;}
    }

    if(ctrl && shift){
        // Ctrl+Shift = create point + connect
        const newPoint = createParticle(mouse.x, mouse.y);
        if(newPoint && selectedParticle) { createStick(selectedParticle,newPoint); selectedParticle.selected=false; selectedParticle=newPoint; newPoint.selected=true; }
    } else if(ctrl){
        if(!nearest) { const newP=createParticle(mouse.x,mouse.y); if(newP){if(selectedParticle){selectedParticle.selected=false;} selectedParticle=newP; selectedParticle.selected=true;} }
    } else if(shift){
        if(nearest && selectedParticle && nearest!==selectedParticle){ createStick(selectedParticle,nearest); selectedParticle.selected=false; selectedParticle=nearest; selectedParticle.selected=true; }
    } else {
        if(nearest){ if(selectedParticle) selectedParticle.selected=false; selectedParticle=nearest; selectedParticle.selected=true; } else { if(selectedParticle) selectedParticle.selected=false; selectedParticle=null; }
    }

    if(mode==="sim" && nearest) draggedParticle = nearest;

    // === NEW: Alt+Click to copy substructure ===
    else if (e.altKey) {
    if (nearest) {
        // collect connected points and sticks
        const related = new Set([nearest]);
        for (const s of sticks) {
            if (s.a === nearest || s.b === nearest) {
                related.add(s.a);
                related.add(s.b);
            }
        }
        const subsetParticles = Array.from(related);
        const subsetSticks = sticks.filter(s => related.has(s.a) && related.has(s.b));
        const data = JSON.stringify({
            particles: subsetParticles.map(p => ({
                x: p.position.x,
                y: p.position.y,
                locked: p.locked
            })),
            sticks: subsetSticks.map(s => ({
                a: subsetParticles.indexOf(s.a),
                b: subsetParticles.indexOf(s.b),
                length: s.length
            }))
        });
        copyToClipboard(data);
    }
}

});
canvas.addEventListener("mouseup",()=>{mouse.down=false; draggedParticle=null;});

// === Keyboard Handling ===
window.addEventListener("keydown",e=>{
    if(e.code==="Space"){ e.preventDefault();
        if(mode==="edit"){ savedEditorState=deepCopyState(); for(const p of particles)p.locked=false; mode="sim"; }
        else{ restoreState(savedEditorState); mode="edit"; }
    }
    if(e.code==="KeyR"){
        if(e.shiftKey){ mode="edit"; } // edit current
        else if(savedEditorState){ restoreState(savedEditorState); mode="edit"; } // restore last editor
    }
    if(e.code==="Backspace" && selectedParticle){
        const target=selectedParticle;
        sticks=sticks.filter(s=>s.a!==target && s.b!==target);
        particles=particles.filter(p=>p!==target);
        selectedParticle=null;
    }

    // === NEW SHORTCUTS ===
    if (!e.ctrlKey && e.code === "KeyS" && !e.shiftKey) { 
        if (e.code === "KeyS" && e.ctrlKey) {
        e.preventDefault();
        try{let data = getCurrentStateData();
            if (!data)data="cheese";
        copyToClipboard(data);}catch{
            alert("BA");}
}

    }
    if (e.ctrlKey && e.code === "KeyV") { e.preventDefault(); showPasteBox(); }
    if (e.ctrlKey && e.shiftKey && e.code === "KeyS") { e.preventDefault(); downloadScene(); }
    if (e.ctrlKey && e.shiftKey && e.code === "KeyC") { e.preventDefault(); exportAll(); }
    if (e.ctrlKey && e.shiftKey && e.code === "KeyO") { e.preventDefault(); fileInput.click(); }
    if (e.code === "Enter" && pasteBox.style.display === "block") { importAll(pasteBox.value); hidePasteBox(); }
    if (e.code === "Escape") hidePasteBox();
});

// === NEW ADDITIONS BELOW (no removals above) ===
// === Clipboard Helpers ===
async function  d(text) {
    try {
        await navigator.clipboard.writeText(text);
        console.log("Copied to clipboard!");
    } catch (err) {
        console.error("Clipboard copy failed:", err);
        alert("Clipboard copy failed. Copy manually:\n" + text);
    }
}
async function copyToClipboard(text) {
  try {
  await navigator.clipboard.writeText(text);
} catch {
  fallbackCopy(text);
}

}
function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy'); // old API
  document.body.removeChild(textarea);
}

function getCurrentStateData() {
    return JSON.stringify({
        particles: particles.map(p => ({
            x: p.position.x,
            y: p.position.y,
            locked: p.locked
        })),
        sticks: sticks.map(s => ({
            a: particles.indexOf(s.a),
            b: particles.indexOf(s.b),
            length: s.length
        }))
    });
}

// === Paste UI ===
const pasteBox = document.createElement("textarea");
pasteBox.style.position = "absolute";
pasteBox.style.top = "10px";
pasteBox.style.left = "10px";
pasteBox.style.width = "300px";
pasteBox.style.height = "100px";
pasteBox.style.display = "none";
pasteBox.style.zIndex = 10;
document.body.appendChild(pasteBox);
function showPasteBox(){ pasteBox.style.display="block"; pasteBox.focus(); }
function hidePasteBox(){ pasteBox.style.display="none"; pasteBox.value=""; }

// === Export/Import All ===
function exportAll(){
    const data={particles:particles.map(p=>({x:p.position.x,y:p.position.y,locked:p.locked})),
                sticks:sticks.map(s=>({a:particles.indexOf(s.a),b:particles.indexOf(s.b),length:s.length}))};
    const json=JSON.stringify(data);
    navigator.clipboard.writeText(json);
    console.log("Scene copied to clipboard");
}

function importAll(json){
    try{
        const data=JSON.parse(json);
        const newParticles=data.particles.map(p=>new Particle(p.x,p.y,p.locked));
        const newSticks=data.sticks.map(s=>new Stick(newParticles[s.a],newParticles[s.b],s.length));
        particles=[...particles,...newParticles]; sticks=[...sticks,...newSticks];
        console.log("Scene loaded");
    }catch(err){ alert("Invalid data"); }
}

// === Export Substructure ===
function exportSubstructure(center){
    const connected=new Set([center]);
    let added=true;
    while(added){
        added=false;
        for(const s of sticks){
            if(connected.has(s.a)&&!connected.has(s.b)){connected.add(s.b);added=true;}
            if(connected.has(s.b)&&!connected.has(s.a)){connected.add(s.a);added=true;}
        }
    }
    const subParticles=Array.from(connected);
    const subSticks=sticks.filter(s=>connected.has(s.a)&&connected.has(s.b));
    const data={particles:subParticles.map(p=>({x:p.position.x,y:p.position.y,locked:p.locked})),
                sticks:subSticks.map(s=>({a:subParticles.indexOf(s.a),b:subParticles.indexOf(s.b),length:s.length}))};
    navigator.clipboard.writeText(JSON.stringify(data));
    console.log("Substructure copied to clipboard");
}

// === Download/Load from file ===
function downloadScene(){
    const data={particles:particles.map(p=>({x:p.position.x,y:p.position.y,locked:p.locked})),
                sticks:sticks.map(s=>({a:particles.indexOf(s.a),b:particles.indexOf(s.b),length:s.length}))};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url; a.download="scene.json"; a.click();
    URL.revokeObjectURL(url);
}

const fileInput=document.createElement("input");
fileInput.type="file";
fileInput.accept=".json";
fileInput.style.display="none";
document.body.appendChild(fileInput);
fileInput.addEventListener("change",e=>{
    const file=e.target.files[0];
    if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>importAll(ev.target.result);
    reader.readAsText(file);
});
// === Arrow Key Controls ===
function moveOrCreateWithArrow(e) {
    const key = e.code;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) return;

    e.preventDefault();

    const dx = (key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0);
    const dy = (key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0);
    const step = 5;
    const gridSize = 25;

    // EDIT MODE BEHAVIOR
    if (mode === "edit") {
        if (e.ctrlKey && e.shiftKey && selectedParticle) {
            // Ctrl+Shift+Arrow: create + connect
            const newPos = snapGrid(
                selectedParticle.position.x + dx * gridSize,
                selectedParticle.position.y + dy * gridSize
            );
            const newP = createParticle(newPos.x, newPos.y);
            if (newP) {
                createStick(selectedParticle, newP);
                selectedParticle.selected = false;
                selectedParticle = newP;
                selectedParticle.selected = true;
            }
            return;
        }

        if (e.ctrlKey) {
            // Ctrl+Arrow: create new point at nearest grid
            const base = selectedParticle
                ? selectedParticle.position
                : { x: canvas.width / 2, y: canvas.height / 2 };
            const newPos = snapGrid(base.x + dx * gridSize, base.y + dy * gridSize);
            const newP = createParticle(newPos.x, newPos.y);
            if (newP) {
                if (selectedParticle) selectedParticle.selected = false;
                selectedParticle = newP;
                selectedParticle.selected = true;
            }
            return;
        }

        // Normal move logic
        const moveSelected = selectedParticle ? [selectedParticle] : particles;
        for (const p of moveSelected) {
            if (e.shiftKey) {
                // Shift: snap to nearest grid line in that direction
                if (dx !== 0) {
                    p.position.x = Math.round(p.position.x / gridSize) * gridSize + dx * gridSize;
                }
                if (dy !== 0) {
                    p.position.y = Math.round(p.position.y / gridSize) * gridSize + dy * gridSize;
                }
            } else {
                // Normal 5px move
                p.position.x += dx * step;
                p.position.y += dy * step;
            }
        }
    }

    // SIM MODE BEHAVIOR
    else if (mode === "sim") {
        const forceAmount = 50;
        const fx = dx * forceAmount;
        const fy = dy * forceAmount;
        if (selectedParticle) {
            selectedParticle.applyForce(fx, fy);
        } else {
            for (const p of particles) p.applyForce(fx, fy);
        }
    }
}

window.addEventListener("keydown", moveOrCreateWithArrow);
