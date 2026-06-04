// ==========================================
// ESTADO GLOBAL
// ==========================================
let currentUserId = null;
// Usamos db_local solo como memoria en vivo, alimentada por Firebase
let db_local = { pets: [], logs: [] }; 
let currentPetId = null;
let currentEventType = "";
let isDirty = false; 
let currentCategoryName = "";
let currentCategoryIcon = "";

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
      } else if (document.getElementById("view-category").classList.contains("active")) {
          renderCategoryLogs();
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
            <div><strong>Edad actual:</strong> ${calculateAge(pet.birth)}</div>
            <div style="margin-top:8px; color:var(--text-secondary); white-space: pre-wrap;">${pet.notes}</div>
            
            <div style="margin-top: 14px;">
                <button onclick="openPetForm('${pet.id}')" class="btn-edit-bio" style="background:var(--accent); color:white; border:none; padding: 6px 12px; border-radius:6px; font-size:0.8rem; cursor:pointer; font-weight:bold;">
                  ✏️ Editar Perfil
                </button>
            </div>
        </div>
    `;

  const categories = [
     { name: "Peso", icon: "⚖️" },
     { name: "Medicinas", icon: "💊" },
     { name: "Vacunas", icon: "💉" },
     { name: "Chequeos", icon: "🩺" },
     { name: "Recomendaciones", icon: "📋" }
  ];

  document.getElementById("detailLogs").innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 15px;">
        ${categories.map(c => `
            <button onclick="openCategory('${c.name}', '${c.icon}')" style="padding: 15px; border-radius: 12px; border: 1px solid #ddd; background: var(--bg-card, #fff); font-size: 0.9rem; font-weight: bold; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:8px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                <span style="font-size: 2rem;">${c.icon}</span>
                ${c.name}
            </button>
        `).join('')}
    </div>
  `;
}

  // Abre la categoría y limpia el formulario integrado
function openCategory(name, icon) {
    currentCategoryName = name;
    currentCategoryIcon = icon;
    document.getElementById("categoryHeader").innerText = icon + " " + name;
    resetInlineForm(); // Limpiamos el formulario al entrar
    renderCategoryLogs();
    showView("category");
}

function resetInlineForm() {
    document.getElementById("editingLogId").value = "";
    document.getElementById("eventDate").valueAsDate = new Date();
    document.getElementById("eventNote").value = "";
    document.getElementById("inlineFormTitle").innerText = "Añadir Nuevo";
    document.getElementById("cancelEditBtn").style.display = "none";
}

// Prepara el formulario integrado para editar un registro existente
function editLog(logId) {
    const log = db_local.logs.find((l) => l.id === logId);
    if (!log) return;
    
    document.getElementById("editingLogId").value = logId;
    document.getElementById("eventDate").value = log.date;
    document.getElementById("eventNote").value = log.note;
    
    document.getElementById("inlineFormTitle").innerText = "✏️ Editando Registro";
    document.getElementById("cancelEditBtn").style.display = "block";
    
    // Subimos la pantalla automáticamente para que el usuario vea el formulario
    document.getElementById("view-category").scrollTo({ top: 0, behavior: 'smooth' });
}

// NUEVA: Filtra la base de datos para mostrar solo los registros de esta categoría
function renderCategoryLogs() {
    const logs = db_local.logs.filter((l) => l.petId === currentPetId && l.type === currentCategoryName);
    const listContainer = document.getElementById("categoryLogsList");

    // Ordenamos para que los más recientes salgan arriba
    logs.sort((a, b) => new Date(b.date) - new Date(a.date));

    listContainer.innerHTML = logs.map((l) => `
        <div class="record-card" style="margin-bottom: 10px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong>${l.date}</strong>
                <span style="font-size: 0.8rem; background: var(--bg-secondary); padding: 2px 6px; border-radius: 4px;">${l.frozenAge} años</span>
            </div>
            <p style="font-size:0.9rem; margin:10px 0; white-space: pre-wrap;">${l.note}</p>
            <div style="display:flex; gap: 15px; margin-top:10px; border-top: 1px solid #eee; padding-top: 8px;">
                <button onclick="openEventForm('${l.id}')" style="background:none; border:none; color:var(--accent); font-size:0.75rem; font-weight:bold; cursor:pointer;">EDITAR</button>
                <button onclick="deleteLog('${l.id}')" style="background:none; border:none; color:var(--danger); font-size:0.75rem; font-weight:bold; cursor:pointer;">BORRAR</button>
            </div>
        </div>
    `).join("") || `<p style="text-align:center; color:gray; margin-top: 30px;">Aún no hay registros en esta sección.</p>`;
}

// REEMPLAZAR: Simplificamos openEventForm porque la categoría ya está seleccionada
function openEventForm(logId = null) {
  currentEventType = currentCategoryName; // Usamos la categoría en la que estamos
  isDirty = false;
  
  if (logId) {
    const log = db_local.logs.find((l) => l.id === logId);
    document.getElementById("editingLogId").value = logId;
    document.getElementById("eventDate").value = log.date;
    document.getElementById("eventNote").value = log.note;
    document.getElementById("eventHeader").innerText = currentCategoryIcon + " Editar";
  } else {
    document.getElementById("editingLogId").value = "";
    document.getElementById("eventDate").valueAsDate = new Date();
    document.getElementById("eventNote").value = "";
    document.getElementById("eventHeader").innerText = currentCategoryIcon + " Nuevo";
  }
  showView("event");
}

// Renderiza la lista (actualizada para llamar a editLog en vez de openEventForm)
function renderCategoryLogs() {
    const logs = db_local.logs.filter((l) => l.petId === currentPetId && l.type === currentCategoryName);
    const listContainer = document.getElementById("categoryLogsList");

    logs.sort((a, b) => new Date(b.date) - new Date(a.date));

    listContainer.innerHTML = logs.map((l) => `
        <div class="record-card" style="margin-bottom: 10px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong>${l.date}</strong>
                <span style="font-size: 0.8rem; background: var(--bg-secondary); padding: 2px 6px; border-radius: 4px;">${l.frozenAge}</span>
            </div>
            <p style="font-size:0.9rem; margin:10px 0; white-space: pre-wrap;">${l.note}</p>
            <div style="display:flex; gap: 15px; margin-top:10px; border-top: 1px solid #eee; padding-top: 8px;">
                <button onclick="editLog('${l.id}')" style="background:none; border:none; color:var(--accent); font-size:0.75rem; font-weight:bold; cursor:pointer;">EDITAR</button>
                <button onclick="deleteLog('${l.id}')" style="background:none; border:none; color:var(--danger); font-size:0.75rem; font-weight:bold; cursor:pointer;">BORRAR</button>
            </div>
        </div>
    `).join("") || `<p style="text-align:center; color:gray; margin-top: 30px;">Aún no hay registros en esta sección.</p>`;
}

async function saveLog() {
  console.log("🚀 [Bitacolitas] Intentando ejecutar saveLog()...");
  const note = document.getElementById("eventNote").value;
  const date = document.getElementById("eventDate").value;
  const logId = document.getElementById("editingLogId").value;

  console.log("📝 Datos del formulario:", { note, date, logId });
  console.log("🐾 Contexto actual:", { currentUserId, currentPetId, currentCategoryName });

  // Validaciones de seguridad para no enviar datos vacíos a Firebase
  if (!currentUserId) return alert("Error: No estás logueado.");
  if (!currentPetId) return alert("Error: No se ha seleccionado ninguna mascota.");
  if (!currentCategoryName) return alert("Error: No hay una categoría activa.");
  if (!note || !date) return alert("Por favor, rellena la fecha y los detalles.");
  
  if (!note || !date) return alert("Faltan datos por llenar");

  const pet = db_local.pets.find((p) => p.id === currentPetId);
  const age = calculateAge(pet.birth, date);

  const logData = {
    petId: currentPetId,
    type: currentCategoryName,
    note,
    date,
    frozenAge: age,
    updatedAt: new Date()
  };

  try {
      if (logId) {
        console.log("🔄 Actualizando registro antiguo en Firestore...");
        await db.collection("users").doc(currentUserId).collection("logs").doc(logId).update(logData);
      } else {
        logData.createdAt = new Date();
        await db.collection("users").doc(currentUserId).collection("logs").add(logData);
      }
      resetInlineForm(); // Limpiamos el formulario para la próxima vez
  } catch(e) {
      console.error("❌ Error de Firestore al guardar:", e);
      alert("Error al guardar el registro.");
  }
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

// NUEVA: Calcula la edad en años y meses de forma exacta
function calculateAge(birthDateString, targetDateString = null) {
    if (!birthDateString) return "Desconocida";

    // Añadimos 'T00:00:00' para evitar que las zonas horarias nos roben un día
    const birth = new Date(birthDateString + 'T00:00:00');
    const target = targetDateString ? new Date(targetDateString + 'T00:00:00') : new Date();

    let years = target.getFullYear() - birth.getFullYear();
    let months = target.getMonth() - birth.getMonth();

    // Si aún no ha pasado el día de su cumpleaños este mes, restamos un mes
    if (target.getDate() < birth.getDate()) {
        months--;
    }

    // Si los meses son negativos, significa que aún no ha cumplido años este año
    if (months < 0) {
        years--;
        months += 12;
    }

    if (years < 0) return "Aún no nacido"; // Prevención de errores con fechas futuras

    // Construimos un texto amigable y gramaticalmente correcto
    let ageString = "";
    
    if (years > 0) {
        ageString += years === 1 ? "1 año" : `${years} años`;
    }
    
    if (months > 0) {
        if (years > 0) ageString += " y ";
        ageString += months === 1 ? "1 mes" : `${months} meses`;
    }

    if (ageString === "") return "Recién nacido";

    return ageString;
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
