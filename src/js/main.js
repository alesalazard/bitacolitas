// ==========================================
// ESTADO GLOBAL
// ==========================================
let currentUserId = null;
// Usamos db_local solo como memoria en vivo, alimentada por Firebase
let db_local = { pets: [], logs: [] }; 
let currentPetId = null;
let currentEventType = "";
let isDirty = false; 

// Variables para apagar los listeners si el usuario cierra sesión
let unsubPets = null;
let unsubLogs = null;

// ==========================================
// 1. OBSERVADOR DE SESIÓN FIREBASE
// ==========================================
auth.onAuthStateChanged((user) => {
  const body = document.body;

  if (user) {
    // --- USUARIO LOGUEADO ---
    currentUserId = user.uid;
    body.classList.add("user-logged"); 
    syncData(); 
    showView("home");
  } else {
    // --- USUARIO CERRÓ SESIÓN ---
    currentUserId = null;
    body.classList.remove("user-logged");
    
    // Apagamos las escuchas a la BD para no consumir recursos
    if (unsubPets) unsubPets();
    if (unsubLogs) unsubLogs();
    
    // Vaciamos la memoria temporal
    db_local = { pets: [], logs: [] };
    document.getElementById("petGrid").innerHTML = "";
    showView("login");
  }
});

// ==========================================
// 2. AUTENTICACIÓN Y REGISTRO
// ==========================================
async function handleAuth(type) {
  const email = document.getElementById("loginEmail").value;
  const pass = document.getElementById("loginPass").value;

  if (!email || !pass) return alert("Por favor completa los datos");

  try {
    if (type === "login") {
      await auth.signInWithEmailAndPassword(email, pass);
    } else {
      const userCredential = await auth.createUserWithEmailAndPassword(email, pass);
      // Inicializamos el documento maestro del usuario
      await db.collection("users").doc(userCredential.user.uid).set({
        createdAt: new Date(),
      });
      alert("¡Cuenta creada exitosamente!");
    }
  } catch (error) {
    alert("Error: " + error.message);
  }
}

// ==========================================
// 3. SINCRONIZACIÓN EN TIEMPO REAL (FIRESTORE)
// ==========================================
function syncData() {
  if (!currentUserId) return;

  // Escuchar Mascotas
  unsubPets = db.collection("users").doc(currentUserId).collection("pets")
    .onSnapshot((snapshot) => {
      db_local.pets = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      renderHome();
      // Si el usuario está viendo el detalle, lo refrescamos
      if (document.getElementById("view-detail").classList.contains("active")) {
          renderDetail();
      }
    });

  // Escuchar Registros Médicos (Logs)
  unsubLogs = db.collection("users").doc(currentUserId).collection("logs")
    .onSnapshot((snapshot) => {
      db_local.logs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      // Si el usuario está viendo el detalle, lo refrescamos
      if (document.getElementById("view-detail").classList.contains("active")) {
          renderDetail();
      }
    });
}

// ==========================================
// 4. GUARDAR Y ELIMINAR DATOS (MASCOTAS Y LOGS)
// ==========================================
function openPetForm(petId = null) {
  isDirty = false;
  
  // Revisa cuál es el ID real de tu vista de formulario en el HTML (puede ser 'pet' o 'pet-form')
  const nombreVistaFormulario = "add"; 

  if (petId) {
    // --- MODO EDICIÓN ---
    const pet = db_local.pets.find((p) => p.id === petId);
    if (!pet) return;

    document.getElementById("editingPetId").value = petId;
    document.getElementById("petName").value = pet.name;
    document.getElementById("petBirth").value = pet.birth;
    document.getElementById("petBreed").value = pet.breed === "-" ? "" : pet.breed;
    document.getElementById("petColor").value = pet.color === "-" ? "" : pet.color;
    document.getElementById("petType").value = pet.type || "";
    document.getElementById("petNotes").value = pet.notes === "Sin notas" ? "" : pet.notes;
  } else {
    // --- MODO CREACIÓN (Vaciar todo) ---
    document.getElementById("editingPetId").value = "";
    document.getElementById("petName").value = "";
    document.getElementById("petBirth").value = "";
    document.getElementById("petBreed").value = "";
    document.getElementById("petColor").value = "";
    document.getElementById("petType").value = "";
    document.getElementById("petNotes").value = "";
  }
  
  showView(nombreVistaFormulario);
}

async function savePet() {
  const name = document.getElementById("petName").value;
  const birth = document.getElementById("petBirth").value;
  const petId = document.getElementById("editingPetId").value; // Detectamos si es edición

  if (!name || !birth) return alert("Faltan datos obligatorios (Nombre y Fecha de Nacimiento)");

  const petData = {
    name,
    birth,
    breed: document.getElementById("petBreed").value || "-",
    color: document.getElementById("petColor").value || "-",
    type: document.getElementById("petType").value,
    notes: document.getElementById("petNotes").value || "Sin notas",
    updatedAt: new Date()
  };

  try {
    if (petId) {
      // ACTUALIZAR EN FIREBASE
      await db.collection("users").doc(currentUserId).collection("pets").doc(petId).update(petData);
      alert("¡Perfil y biografía actualizados con éxito!");
    } else {
      // CREAR NUEVO EN FIREBASE
      petData.createdAt = new Date();
      await db.collection("users").doc(currentUserId).collection("pets").add(petData);
      alert("¡Mascota guardada con éxito!");
    }
    
    // Limpiamos por completo el formulario
    document.getElementById("editingPetId").value = "";
    document.getElementById("petName").value = "";
    document.getElementById("petBirth").value = "";
    document.getElementById("petBreed").value = "";
    document.getElementById("petColor").value = "";
    document.getElementById("petType").value = "";
    document.getElementById("petNotes").value = "";

    isDirty = false;
    
    // Si editábamos, volvemos a su pantalla de detalle; si era nueva, al Home
    if (petId) {
      showView("detail");
    } else {
      showView("home");
    }
  } catch (error) {
    console.error("Error guardando mascota:", error);
    alert("Hubo un error al guardar los datos en la nube.");
  }
}

async function deletePet() {
  if (confirm("¿Borrar perfil? Se eliminará la mascota y todos sus registros médicos para siempre.")) {
    try {
        // Borramos el perfil
        await db.collection("users").doc(currentUserId).collection("pets").doc(currentPetId).delete();
        
        // Borramos sus historiales en cascada
        const logsToDelete = db_local.logs.filter((l) => l.petId === currentPetId);
        for(let log of logsToDelete) {
            await db.collection("users").doc(currentUserId).collection("logs").doc(log.id).delete();
        }
        
        showView("home");
    } catch(e) {
        alert("Hubo un error al eliminar.");
    }
  }
}

async function saveLog() {
  const note = document.getElementById("eventNote").value;
  const date = document.getElementById("eventDate").value;
  const logId = document.getElementById("editingLogId").value;
  
  const pet = db_local.pets.find((p) => p.id === currentPetId);
  const age = calculateAge(pet.birth, date);

  const logData = {
    petId: currentPetId,
    type: currentEventType,
    note,
    date,
    frozenAge: age,
    updatedAt: new Date()
  };

  try {
      if (logId) {
        // Actualizar registro existente
        await db.collection("users").doc(currentUserId).collection("logs").doc(logId).update(logData);
      } else {
        // Crear registro nuevo
        logData.createdAt = new Date();
        await db.collection("users").doc(currentUserId).collection("logs").add(logData);
      }
      isDirty = false;
      showView("detail");
  } catch(e) {
      alert("Error al guardar el registro.");
  }
}

async function deleteLog(id) {
  if (confirm("¿Borrar este registro?")) {
    try {
        await db.collection("users").doc(currentUserId).collection("logs").doc(id).delete();
    } catch(e) {
        alert("Error al borrar el registro.");
    }
  }
}

// ==========================================
// 5. RENDERIZADO DE LA INTERFAZ (UI)
// ==========================================
function renderHome() {
  const grid = document.getElementById("petGrid");
  if(!grid) return;

  grid.innerHTML = db_local.pets.map((p) => {
        // Asignamos el emoji según la selección
        let icon = "🐾";
        if (p.type && p.type.includes("Gato")) icon = "🐱";
        else if (p.type && p.type.includes("Perro")) icon = "🐶";
        else if (p.type && p.type.includes("Otro")) icon = "🐰";

        // Nota el cambio importante: openPet('${p.id}') va con comillas
        return `
        <div class="pet-card-btn" onclick="openPet('${p.id}')">
            <span class="pet-avatar-large">${icon}</span>
            <strong>${p.name}</strong>
        </div>
        `;
    }).join("") || '<p style="color:gray; width: 100%; text-align: center;">Presiona "+" para añadir.</p>';
}

function renderDetail() {
  const pet = db_local.pets.find((p) => p.id === currentPetId);
  if(!pet) return;

  document.getElementById("detailPetName").innerText = pet.name;
  
  // Agregamos el botón de editar al final del HTML de la biografía
  document.getElementById("petBio").innerHTML = `
        <div style="font-size:0.9rem; position: relative;">
            <div><strong>Raza:</strong> ${pet.breed}</div>
            <div><strong>Color:</strong> ${pet.color}</div>
            <div><strong>Edad actual:</strong> ${calculateAge(pet.birth)} años</div>
            <div style="margin-top:8px; color:var(--text-secondary); white-space: pre-wrap;">${pet.notes}</div>
            
            <div style="margin-top: 14px;">
                <button onclick="openPetForm('${pet.id}')" class="btn-edit-bio" style="background:var(--accent); color:white; border:none; padding: 6px 12px; border-radius:6px; font-size:0.8rem; cursor:pointer; font-weight:bold;">
                  ✏️ Editar Perfil
                </button>
            </div>
        </div>
    `;
    
  const logs = db_local.logs.filter((l) => l.petId === currentPetId);
  document.getElementById("detailLogs").innerHTML = logs.map((l) => `
        <div class="record-card">
            <div style="display:flex; justify-content:space-between"><strong>${l.type}</strong><span>${l.frozenAge} años</span></div>
            <p style="font-size:0.85rem; margin:8px 0">${l.note}</p>
            <small style="color:var(--text-secondary)">${l.date}</small>
            <div style="margin-top:10px">
                <button onclick="openEventForm('${l.type}', '✏️', '${l.id}')" style="background:none; border:none; color:var(--accent); font-size:0.7rem">EDITAR</button>
                <button onclick="deleteLog('${l.id}')" style="background:none; border:none; color:var(--danger); font-size:0.7rem; margin-left:10px">BORRAR</button>
            </div>
        </div>
    `).join("") || "<p>Sin registros médicos.</p>";
}

// ==========================================
// 6. FUNCIONES DE NAVEGACIÓN Y UTILIDAD
// ==========================================
function openPet(id) {
  currentPetId = id;
  showView("detail");
}

function showView(viewId) {
  if (!currentUserId && viewId !== "login") {
    viewId = "login";
  }

  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById("view-" + viewId).classList.add("active");

  if (document.getElementById("sideMenu").classList.contains("active")) {
    toggleMenu();
  }

  if (viewId === "home") renderHome();
  if (viewId === "detail") renderDetail();
}

function toggleMenu() {
  document.getElementById("sideMenu").classList.toggle("active");
  document.getElementById("overlay").classList.toggle("active");
}

function markDirty() {
  isDirty = true;
}

function safeGoHome() {
  if (isDirty) {
    if(!confirm("Tienes información sin guardar. ¿Seguro que quieres volver al inicio y descartar los cambios?")) {
        if (document.getElementById("sideMenu").classList.contains("active")) toggleMenu();
        return;
    }
  }
  isDirty = false;
  showView("home");
}

function safeGoProfile() {
  if (isDirty) {
    if(!confirm("Tienes información sin guardar. ¿Seguro que quieres volver al perfil y descartar los cambios?")) {
        if (document.getElementById("sideMenu").classList.contains("active")) toggleMenu();
        return;
    }
  }
  isDirty = false;
  showView("detail");
}

function calculateAge(birthDate, refDate = new Date()) {
  const birth = new Date(birthDate);
  const ref = new Date(refDate);
  let age = ref.getFullYear() - birth.getFullYear();
  if (ref.getMonth() < birth.getMonth() || (ref.getMonth() === birth.getMonth() && ref.getDate() < birth.getDate())) age--;
  return age < 0 ? 0 : age;
}

function openEventForm(type, icon, logId = null) {
  currentEventType = type;
  document.getElementById("eventHeader").innerText = icon + " " + type;
  isDirty = false;
  
  if (logId) {
    const log = db_local.logs.find((l) => l.id === logId);
    document.getElementById("editingLogId").value = logId;
    document.getElementById("eventDate").value = log.date;
    document.getElementById("eventNote").value = log.note;
  } else {
    document.getElementById("editingLogId").value = "";
    document.getElementById("eventDate").valueAsDate = new Date();
    document.getElementById("eventNote").value = "";
  }
  showView("event");
}

function toggleTheme() {
  const body = document.body;
  body.setAttribute("data-theme", body.getAttribute("data-theme") === "light" ? "dark" : "light");
  toggleMenu();
}

function exportData() {
  const blob = new Blob([JSON.stringify(db_local)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bitacolitas_backup.json";
  a.click();
  toggleMenu();
}

function clearAll() {
  if (confirm("Esto cerrará tu sesión pero tus datos seguirán seguros en la nube de Firebase.")) {
    auth.signOut();
    localStorage.clear();
    location.reload();
  }
}
