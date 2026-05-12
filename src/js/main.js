// 1. Observador de usuario (Detecta quién entró)
      auth.onAuthStateChanged((user) => {
        if (user) {
          currentUserId = user.uid; // ID único de tu amigo o tuyo
          syncData(); // Trae los datos de la nube
        } else {
          showView("login"); // Si no hay nadie, muestra el login
        }
      });

      // 2. Función de Autenticación
      async function handleAuth(type) {
        const email = document.getElementById("loginEmail").value;
        const pass = document.getElementById("loginPass").value;

        if (!email || !pass) return alert("Por favor completa los datos");

        try {
          if (type === "login") {
            await auth.signInWithEmailAndPassword(email, pass);
          } else {
            const userCredential = await auth.createUserWithEmailAndPassword(
              email,
              pass,
            );
            // Si es nuevo, inicializamos su "caja fuerte" en Firestore
            await db.collection("users").doc(userCredential.user.uid).set({
              createdAt: new Date(),
            });
            alert("¡Cuenta creada exitosamente!");
          }
        } catch (error) {
          alert("Error: " + error.message);
        }
      }

      // 3. Sincronización con la Nube (Multiusuario)
      function syncData() {
        // Escucha cambios en tiempo real solo para las mascotas del usuario actual
        db.collection("users")
          .doc(currentUserId)
          .collection("pets")
          .onSnapshot((snapshot) => {
            db_local.pets = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }));
            renderHome();
          });

        db.collection("users")
          .doc(currentUserId)
          .collection("logs")
          .onSnapshot((snapshot) => {
            db_local.logs = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }));
            renderHome();
          });
      }

      // 4. Actualizar guardado (Ejemplo para mascotas)
      async function savePet() {
        const name = document.getElementById("petName").value;
        const birth = document.getElementById("petBirth").value;

        if (!name || !birth) return;

        const newPet = {
          name,
          birth,
          breed: document.getElementById("petBreed").value || "-",
          color: document.getElementById("petColor").value || "-",
          type: document.getElementById("petType").value,
          notes: document.getElementById("petNotes").value || "",
        };

        // Esto lo guarda en la nube bajo el perfil de quien esté logueado
        await db
          .collection("users")
          .doc(currentUserId)
          .collection("pets")
          .add(newPet);
        isDirty = false;
        showView("home");
      }

      let db_local = JSON.parse(localStorage.getItem("pet_db_v6")) || {
        pets: [],
        logs: [],
      };
      let currentPetId = null;
      let currentEventType = "";
      let isDirty = false; // Rastreador de cambios

      function toggleMenu() {
        document.getElementById("sideMenu").classList.toggle("active");
        document.getElementById("overlay").classList.toggle("active");
      }

      function markDirty() {
        isDirty = true;
      }

      function safeGoHome() {
        if (isDirty) {
          const proceed = confirm(
            "Tienes información sin guardar. ¿Seguro que quieres volver al inicio y descartar los cambios?",
          );
          if (!proceed) {
            if (
              document.getElementById("sideMenu").classList.contains("active")
            )
              toggleMenu();
            return;
          }
        }
        isDirty = false;
        showView("home");
      }

      function safeGoProfile() {
        if (isDirty) {
          const proceed = confirm(
            "Tienes información sin guardar. ¿Seguro que quieres volver al perfil y descartar los cambios?",
          );
          if (!proceed) {
            if (
              document.getElementById("sideMenu").classList.contains("active")
            )
              toggleMenu();
            return;
          }
        }
        isDirty = false;
        showView("detail");
      }

      function showView(viewId) {
        document
          .querySelectorAll(".view")
          .forEach((v) => v.classList.remove("active"));
        document.getElementById("view-" + viewId).classList.add("active");
        if (document.getElementById("sideMenu").classList.contains("active"))
          toggleMenu();
        if (viewId === "home") renderHome();
        if (viewId === "detail") renderDetail();
      }

      function calculateAge(birthDate, refDate = new Date()) {
        const birth = new Date(birthDate);
        const ref = new Date(refDate);
        let age = ref.getFullYear() - birth.getFullYear();
        if (
          ref.getMonth() < birth.getMonth() ||
          (ref.getMonth() === birth.getMonth() &&
            ref.getDate() < birth.getDate())
        )
          age--;
        return age < 0 ? 0 : age;
      }

      function savePet() {
        const name = document.getElementById("petName").value;
        const birth = document.getElementById("petBirth").value;
        if (!name || !birth) return alert("Faltan datos obligatorios");

        db.pets.push({
          id: Date.now(),
          name,
          birth,
          breed: document.getElementById("petBreed").value || "-",
          color: document.getElementById("petColor").value || "-",
          type: document.getElementById("petType").value,
          notes: document.getElementById("petNotes").value || "Sin notas",
        });
        saveDB();
        isDirty = false;
        showView("home");
      }

      function openEventForm(type, icon, logId = null) {
        currentEventType = type;
        document.getElementById("eventHeader").innerText = icon + " " + type;
        isDirty = false;
        if (logId) {
          const log = db.logs.find((l) => l.id === logId);
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

      function saveLog() {
        const note = document.getElementById("eventNote").value;
        const date = document.getElementById("eventDate").value;
        const logId = document.getElementById("editingLogId").value;
        const pet = db.pets.find((p) => p.id === currentPetId);
        const age = calculateAge(pet.birth, date);

        if (logId) {
          const idx = db.logs.findIndex((l) => l.id == logId);
          db.logs[idx] = { ...db.logs[idx], note, date, frozenAge: age };
        } else {
          db.logs.unshift({
            id: Date.now(),
            petId: currentPetId,
            type: currentEventType,
            note,
            date,
            frozenAge: age,
          });
        }
        saveDB();
        isDirty = false;
        showView("detail");
      }

      function renderHome() {
        const grid = document.getElementById("petGrid");
        grid.innerHTML =
          db_local.pets
            .map(
              (p) => `
                <div class="pet-card-btn" onclick="openPet(${p.id})">
                    <span class="pet-avatar-large">${p.type.includes("Gato") ? "🐱" : "🐶"}</span>
                    <strong>${p.name}</strong>
                </div>
            `,
            )
            .join("") || '<p style="color:gray">Presiona "+" para añadir.</p>';
      }

      function openPet(id) {
        currentPetId = id;
        showView("detail");
      }

      function renderDetail() {
        const pet = db_local.pets.find((p) => p.id === currentPetId);
        document.getElementById("detailPetName").innerText = pet.name;
        document.getElementById("petBio").innerHTML = `
                <div style="font-size:0.9rem">
                    <div><strong>Raza:</strong> ${pet.breed}</div>
                    <div><strong>Color:</strong> ${pet.color}</div>
                    <div><strong>Edad actual:</strong> ${calculateAge(pet.birth)} años</div>
                    <div style="margin-top:8px; color:var(--text-secondary)">${pet.notes}</div>
                </div>
            `;
        const logs = db_local.logs.filter((l) => l.petId === currentPetId);
        document.getElementById("detailLogs").innerHTML =
          logs
            .map(
              (l) => `
                <div class="record-card">
                    <div style="display:flex; justify-content:space-between"><strong>${l.type}</strong><span>${l.frozenAge} años</span></div>
                    <p style="font-size:0.85rem; margin:8px 0">${l.note}</p>
                    <small style="color:var(--text-secondary)">${l.date}</small>
                    <div style="margin-top:10px">
                        <button onclick="openEventForm('${l.type}', '✏️', ${l.id})" style="background:none; border:none; color:var(--accent); font-size:0.7rem">EDITAR</button>
                        <button onclick="deleteLog(${l.id})" style="background:none; border:none; color:var(--danger); font-size:0.7rem; margin-left:10px">BORRAR</button>
                    </div>
                </div>
            `,
            )
            .join("") || "<p>Sin registros.</p>";
      }

      function deleteLog(id) {
        if (confirm("¿Borrar?")) {
          db_local.logs = db_local.logs.filter((l) => l.id !== id);
          saveDB();
          renderDetail();
        }
      }
      function deletePet() {
        if (confirm("¿Borrar perfil?")) {
          db_local.pets = db_local.pets.filter((p) => p.id !== currentPetId);
          db_local.logs = db_local.logs.filter((l) => l.petId !== currentPetId);
          saveDB();
          showView("home");
        }
      }
      function saveDB() {
        localStorage.setItem("pet_db_v6", JSON.stringify(db_local));
      }
      function toggleTheme() {
        const body = document.body;
        body.setAttribute(
          "data-theme",
          body.getAttribute("data-theme") === "light" ? "dark" : "light",
        );
        toggleMenu();
      }
      function exportData() {
        const blob = new Blob([JSON.stringify(db_local)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "descargar_datos.json";
        a.click();
        toggleMenu();
      }
      function clearAll() {
        if (confirm("Esto vaciará los datos de la memoria local del teléfono pero continuará en la base de datos.")) {
          localStorage.clear();
          location.reload();
        }
      }

      renderHome();

      let currentUserId = null;

      auth.onAuthStateChanged((user) => {
        const body = document.body;

        if (user) {
          // --- USUARIO LOGUEADO ---
          currentUserId = user.uid;
          body.classList.add("user-logged"); // Esto activa el botón ☰ en el CSS

          // Sincronizamos datos y vamos al Home
          syncData();
          showView("home");
        } else {
          // --- USUARIO CERRÓ SESIÓN O NO ESTÁ LOGUEADO ---
          currentUserId = null;
          body.classList.remove("user-logged"); // Esto oculta el botón ☰

          // Limpiamos la interfaz y mostramos Login
          document.getElementById("petGrid").innerHTML = "";
          showView("login");
        }
      });

      // Modificamos la función showView para mayor seguridad
      function showView(viewId) {
        // Si alguien intenta ir a 'home' sin estar logueado, lo mandamos a login
        if (!currentUserId && viewId !== "login") {
          viewId = "login";
        }

        document
          .querySelectorAll(".view")
          .forEach((v) => v.classList.remove("active"));
        document.getElementById("view-" + viewId).classList.add("active");

        // Cerrar el menú automáticamente al cambiar de vista si estaba abierto
        if (document.getElementById("sideMenu").classList.contains("active")) {
          toggleMenu();
        }
      }