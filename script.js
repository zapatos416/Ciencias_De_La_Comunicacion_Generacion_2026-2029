import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithCustomToken, signInAnonymously, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Tus credenciales oficiales de Firebase (Proyecto: generacion-2026)
const firebaseConfig = {
    apiKey: "AIzaSyAotgvwqogdtmHt3Co40BlR153aLDd29uQ",
    authDomain: "generacion-2026.firebaseapp.com",
    projectId: "generacion-2026",
    storageBucket: "generacion-2026.firebasestorage.app",
    messagingSenderId: "126634090587",
    appId: "1:126634090587:web:3c261a95366078a5a85f7e",
    measurementId: "G-Z345ZL2Z3Q"
};

const appId = typeof __app_id !== 'undefined' ? __app_id : 'usur-comunicacion-2026';
const SUPREME_ADMIN_EMAIL = "zapatos416@gmail.com";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// App State
let currentUser = null;
let isSupremeAdmin = false;
let albums = [];
let posts = [];
let members = [];
let currentAlbumId = null;
let currentView = 'albums';
let currentSelectedPostId = null;
let selectedFileBase64 = null;

window.addEventListener('DOMContentLoaded', async () => {
    try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }
    } catch (e) {
        console.warn("Auth initialization fallback:", e);
    }

    onAuthStateChanged(auth, async (user) => {
        if (user && !user.isAnonymous) {
            currentUser = user;
            isSupremeAdmin = (user.email === SUPREME_ADMIN_EMAIL);
            
            try {
                const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid);
                await setDoc(userRef, {
                    uid: user.uid,
                    name: user.displayName || 'Estudiante USUR',
                    email: user.email || '',
                    photoURL: user.photoURL || 'https://placehold.co/150x150/1e3a8a/white?text=User',
                    role: isSupremeAdmin ? 'Admin Supremo' : 'Miembro',
                    lastLogin: new Date().toISOString()
                }, { merge: true });
            } catch(err) {
                console.error("Error saving user profile:", err);
            }

            updateAuthUI();
        } else {
            currentUser = null;
            isSupremeAdmin = false;
            updateAuthUI();
        }
        
        setupFirestoreListeners();
    });
});

window.loginWithGoogle = async function() {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
        showToast("¡Sesión iniciada correctamente!", "success");
    } catch (error) {
        console.error("Google sign in error:", error);
        showToast("Error al iniciar sesión con Google", "error");
    }
};

window.logout = async function() {
    try {
        await signOut(auth);
        await signInAnonymously(auth);
        showToast("Sesión cerrada", "success");
    } catch (error) {
        console.error("Logout error:", error);
    }
};

function updateAuthUI() {
    const loginBtn = document.getElementById('loginBtn');
    const userProfileBadge = document.getElementById('userProfileBadge');
    const navCreateAlbumBtn = document.getElementById('navCreateAlbumBtn');
    const uploadPhotoBtn = document.getElementById('uploadPhotoBtn');
    const footerAuthStatus = document.getElementById('footerAuthStatus');
    const adminNotice = document.getElementById('adminNotice');

    if (currentUser && !currentUser.isAnonymous) {
        loginBtn.classList.add('hidden');
        userProfileBadge.classList.remove('hidden');
        document.getElementById('userAvatar').src = currentUser.photoURL || 'https://placehold.co/150x150/1e3a8a/white?text=User';
        document.getElementById('userName').innerText = currentUser.displayName || 'Usuario';
        
        const roleBadge = document.getElementById('userRoleBadge');
        if (isSupremeAdmin) {
            roleBadge.innerText = 'Admin Supremo';
            roleBadge.className = 'text-[10px] font-bold text-blue-800 uppercase';
            navCreateAlbumBtn.classList.remove('hidden');
            if(adminNotice) adminNotice.innerText = 'Modo Admin Supremo Activo (zapatos416@gmail.com)';
        } else {
            roleBadge.innerText = 'Miembro Gen 26-29';
            roleBadge.className = 'text-[10px] font-semibold text-blue-700 uppercase';
            navCreateAlbumBtn.classList.add('hidden');
            if(adminNotice) adminNotice.innerText = 'Cualquier miembro autenticado puede subir fotos a los álbumes';
        }

        footerAuthStatus.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500 inline-block mr-1.5"></span>Conectado como ${currentUser.displayName || currentUser.email}`;
    } else {
        loginBtn.classList.remove('hidden');
        userProfileBadge.classList.add('hidden');
        navCreateAlbumBtn.classList.add('hidden');
        if(adminNotice) adminNotice.innerText = 'Inicia sesión con Google para subir fotos y participar';
        footerAuthStatus.innerHTML = `<span class="w-2 h-2 rounded-full bg-slate-400 inline-block mr-1.5"></span>Modo Visitante (Inicia sesión para subir fotos)`;
    }

    renderView();
}

function setupFirestoreListeners() {
    try {
        const albumsQuery = query(collection(db, 'artifacts', appId, 'public', 'data', 'albums'));
        onSnapshot(albumsQuery, (snapshot) => {
            albums = [];
            snapshot.forEach(docSnap => {
                albums.push({ id: docSnap.id, ...docSnap.data() });
            });
            
            if (albums.length === 0) {
                seedDefaultAlbums();
            } else {
                updateStats();
                if (currentView === 'albums') renderAlbumsGrid();
            }
        });
    } catch(e) {
        console.error("Albums listener error:", e);
        loadFallbackAlbums();
    }

    try {
        const postsQuery = query(collection(db, 'artifacts', appId, 'public', 'data', 'posts'));
        onSnapshot(postsQuery, (snapshot) => {
            posts = [];
            snapshot.forEach(docSnap => {
                posts.push({ id: docSnap.id, ...docSnap.data() });
            });
            updateStats();
            if (currentView === 'photos' && currentAlbumId) renderPhotosGrid();
        });
    } catch(e) {
        console.error("Posts listener error:", e);
        loadFallbackPosts();
    }

    try {
        const membersQuery = query(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
        onSnapshot(membersQuery, (snapshot) => {
            members = [];
            snapshot.forEach(docSnap => {
                members.push({ id: docSnap.id, ...docSnap.data() });
            });
            if (currentView === 'members') renderMembersGrid();
        });
    } catch(e) {
        console.error("Members listener error:", e);
    }
}

async function seedDefaultAlbums() {
    const defaults = [
        {
            title: 'Primer día de clases',
            category: 'Eventos',
            description: 'Iniciando nuestra aventura en Ciencias de la Comunicación, generación 2026-2029.',
            coverUrl: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?q=80&w=800&auto=format&fit=crop',
            createdAt: new Date().toISOString()
        },
        {
            title: 'Prácticas de Radio',
            category: 'Clases',
            description: 'Sesiones de locución y manejo de consola en el estudio de la universidad.',
            coverUrl: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=800&auto=format&fit=crop',
            createdAt: new Date().toISOString()
        },
        {
            title: 'Talleres y Conferencias',
            category: 'Proyectos',
            description: 'Conferencias magistrales de periodismo y producción audiovisual.',
            coverUrl: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?q=80&w=800&auto=format&fit=crop',
            createdAt: new Date().toISOString()
        }
    ];

    try {
        for (let alb of defaults) {
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'albums'), alb);
        }
    } catch(e) {
        console.error("Error seeding albums:", e);
        loadFallbackAlbums();
    }
}

function loadFallbackAlbums() {
    albums = [
        { id: '1', title: 'Primer día de clases', category: 'Eventos', description: 'Iniciando nuestra aventura en Ciencias de la Comunicación.', coverUrl: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?q=80&w=800&auto=format&fit=crop' },
        { id: '2', title: 'Prácticas de Radio', category: 'Clases', description: 'Sesiones de locución en el estudio.', coverUrl: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=800&auto=format&fit=crop' }
    ];
    updateStats();
    renderAlbumsGrid();
}

function loadFallbackPosts() {
    posts = [
        { id: 'p1', albumId: '1', title: 'Llegada al campus', description: 'Reunidos en la entrada principal.', authorName: 'José Ignacio Ramírez', authorAvatar: 'https://placehold.co/150', timestamp: '2026-08-18 09:30', imageUrl: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?q=80&w=800&auto=format&fit=crop' }
    ];
    updateStats();
}

function updateStats() {
    document.getElementById('statsAlbums').innerText = `${albums.length} álbumes`;
    document.getElementById('statsTotal').innerText = `${posts.length} recuerdos`;
}

window.goHome = function() {
    currentView = 'albums';
    currentAlbumId = null;
    setActiveNav('home');
    renderView();
};

window.openMembersView = function() {
    currentView = 'members';
    currentAlbumId = null;
    setActiveNav('members');
    renderView();
};

window.openAlbum = function(albumId) {
    currentView = 'photos';
    currentAlbumId = albumId;
    setActiveNav('home');
    renderView();
};

function setActiveNav(tab) {
    const homeBtn = document.getElementById('navHomeBtn');
    const membersBtn = document.getElementById('navMembersBtn');
    const mobileHome = document.getElementById('mobileNavHomeBtn');
    const mobileMembers = document.getElementById('mobileNavMembersBtn');

    if (tab === 'home') {
        homeBtn.className = 'px-4 py-2 rounded-xl text-sm font-semibold text-blue-800 bg-blue-50 transition-all';
        membersBtn.className = 'px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:text-blue-800 hover:bg-blue-50/50 transition-all';
        mobileHome.className = 'flex items-center space-x-1.5 text-xs font-semibold text-blue-800 py-1.5 px-3 rounded-lg bg-blue-50';
        mobileMembers.className = 'flex items-center space-x-1.5 text-xs font-medium text-slate-600 py-1.5 px-3 rounded-lg';
    } else {
        membersBtn.className = 'px-4 py-2 rounded-xl text-sm font-semibold text-blue-800 bg-blue-50 transition-all';
        homeBtn.className = 'px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:text-blue-800 hover:bg-blue-50/50 transition-all';
        mobileMembers.className = 'flex items-center space-x-1.5 text-xs font-semibold text-blue-800 py-1.5 px-3 rounded-lg bg-blue-50';
        mobileHome.className = 'flex items-center space-x-1.5 text-xs font-medium text-slate-600 py-1.5 px-3 rounded-lg';
    }
}

function renderView() {
    const albumsView = document.getElementById('albumsView');
    const photosView = document.getElementById('photosView');
    const membersView = document.getElementById('membersView');
    const homeBanner = document.getElementById('homeBanner');
    const breadcrumbSeparator = document.getElementById('breadcrumbSeparator');
    const breadcrumbCurrent = document.getElementById('breadcrumbCurrent');

    albumsView.classList.add('hidden');
    photosView.classList.add('hidden');
    membersView.classList.add('hidden');
    homeBanner.classList.add('hidden');

    if (currentView === 'albums') {
        albumsView.classList.remove('hidden');
        homeBanner.classList.remove('hidden');
        breadcrumbSeparator.classList.add('hidden');
        breadcrumbCurrent.classList.add('hidden');
        renderAlbumsGrid();
    } else if (currentView === 'photos') {
        photosView.classList.remove('hidden');
        breadcrumbSeparator.classList.remove('hidden');
        breadcrumbCurrent.classList.remove('hidden');

        const album = albums.find(a => a.id === currentAlbumId);
        if (album) {
            breadcrumbCurrent.innerText = album.title;
            document.getElementById('activeAlbumTitle').innerText = album.title;
            document.getElementById('activeAlbumCategory').innerText = album.category;
            document.getElementById('activeAlbumDesc').innerText = album.description;
        }

        const uploadBtn = document.getElementById('uploadPhotoBtn');
        if (currentUser && !currentUser.isAnonymous) {
            uploadBtn.classList.remove('hidden');
        } else {
            uploadBtn.classList.add('hidden');
        }

        renderPhotosGrid();
    } else if (currentView === 'members') {
        membersView.classList.remove('hidden');
        breadcrumbSeparator.classList.remove('hidden');
        breadcrumbCurrent.classList.remove('hidden');
        breadcrumbCurrent.innerText = 'Miembros de la Página';
        renderMembersGrid();
    }
}

function renderAlbumsGrid(searchQuery = '') {
    const grid = document.getElementById('albumsGrid');
    let filtered = albums.filter(a => a.title.toLowerCase().includes(searchQuery) || a.description.toLowerCase().includes(searchQuery));

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-12 text-slate-400 text-sm">No se encontraron álbumes.</div>`;
        return;
    }

    grid.innerHTML = filtered.map(album => {
        const count = posts.filter(p => p.albumId === album.id).length;
        return `
            <div onclick="openAlbum('${album.id}')" class="bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-blue-100 group cursor-pointer flex flex-col">
                <div class="relative h-48 overflow-hidden bg-slate-100">
                    <img src="${album.coverUrl}" alt="${album.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onerror="this.src='https://placehold.co/600x400/1e3a8a/white?text=Album'">
                    <div class="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent"></div>
                    <div class="absolute top-3 left-3">
                        <span class="bg-slate-900/70 backdrop-blur-md text-white text-[11px] font-medium px-3 py-1 rounded-full shadow">
                            ${album.category}
                        </span>
                    </div>
                    <div class="absolute bottom-3 left-3 right-3 text-white">
                        <p class="text-xs font-medium text-blue-200"><i class="fa-solid fa-images mr-1"></i>${count} recuerdos</p>
                    </div>
                </div>
                <div class="p-5 flex flex-col justify-between flex-grow">
                    <div>
                        <h3 class="font-bold text-slate-800 text-base mb-1 group-hover:text-blue-700 transition-colors">
                            ${album.title}
                        </h3>
                        <p class="text-slate-500 text-xs line-clamp-2 leading-relaxed">
                            ${album.description}
                        </p>
                    </div>
                    <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-blue-700 font-medium">
                        <span>Explorar carpeta</span>
                        <i class="fa-solid fa-arrow-right group-hover:translate-x-1 transition-transform"></i>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderPhotosGrid(searchQuery = '') {
    const grid = document.getElementById('galleryGrid');
    const emptyState = document.getElementById('emptyPhotosState');

    let filtered = posts.filter(p => p.albumId === currentAlbumId && (
        p.title.toLowerCase().includes(searchQuery) ||
        p.description.toLowerCase().includes(searchQuery) ||
        (p.authorName && p.authorName.toLowerCase().includes(searchQuery))
    ));

    if (filtered.length === 0) {
        grid.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    grid.innerHTML = filtered.map(post => `
        <div class="masonry-item bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-blue-100 group cursor-pointer flex flex-col" onclick="openDetailModal('${post.id}')">
            <div class="relative overflow-hidden bg-slate-100">
                <img src="${post.imageUrl}" alt="${post.title}" loading="lazy" class="w-full object-cover group-hover:scale-105 transition-transform duration-500 max-h-96" onerror="this.src='https://placehold.co/600x400/1e3a8a/white?text=Foto'">
            </div>
            <div class="p-5 flex flex-col justify-between flex-grow">
                <div>
                    <h3 class="font-bold text-slate-800 text-base mb-1.5 group-hover:text-blue-700 transition-colors leading-snug">
                        ${post.title}
                    </h3>
                    <p class="text-slate-500 text-xs line-clamp-2 leading-relaxed mb-4">
                        ${post.description}
                    </p>
                </div>
                <div class="flex items-center justify-between pt-3 border-t border-slate-100 text-[11px] text-slate-400">
                    <span class="font-medium text-slate-600 truncate max-w-[140px] flex items-center space-x-1.5">
                        <img src="${post.authorAvatar || 'https://placehold.co/50'}" class="w-4 h-4 rounded-full object-cover">
                        <span class="truncate">${post.authorName || 'Estudiante'}</span>
                    </span>
                    <span class="whitespace-nowrap">
                        <i class="fa-regular fa-clock mr-1 text-blue-600"></i>${formatShortDate(post.timestamp)}
                    </span>
                </div>
            </div>
        </div>
    `).join('');
}

function renderMembersGrid() {
    const grid = document.getElementById('membersGrid');
    if (members.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-12 text-slate-400 text-sm">Cargando miembros...</div>`;
        return;
    }

    grid.innerHTML = members.map(m => `
        <div class="bg-white rounded-3xl p-6 shadow-sm border border-blue-100 flex items-center space-x-4">
            <img src="${m.photoURL}" alt="${m.name}" class="w-16 h-16 rounded-2xl object-cover border-2 border-blue-200 shadow-sm">
            <div class="flex-grow overflow-hidden">
                <span class="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${m.role === 'Admin Supremo' ? 'bg-blue-900 text-white' : 'bg-blue-50 text-blue-800'} mb-1">
                    ${m.role}
                </span>
                <h4 class="font-bold text-slate-800 text-base truncate">${m.name}</h4>
                <p class="text-xs text-slate-400 truncate">${m.email}</p>
            </div>
        </div>
    `).join('');
}

function formatShortDate(timestampStr) {
    try {
        const [datePart, timePart] = timestampStr.split(' ');
        const [year, month, day] = datePart.split('-');
        const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        return `${day} ${months[parseInt(month, 10) - 1]} ${year}, ${timePart}`;
    } catch (e) {
        return timestampStr;
    }
}

window.openCreateAlbumModal = function() {
    if (!isSupremeAdmin) {
        showToast("Acceso restringido: Solo el Admin Supremo puede crear álbumes", "error");
        return;
    }
    document.getElementById('createAlbumModal').classList.remove('hidden');
    setTimeout(() => {
        document.getElementById('createAlbumModalContent').classList.remove('scale-95', 'opacity-0');
        document.getElementById('createAlbumModalContent').classList.add('scale-100', 'opacity-100');
    }, 10);
};

window.closeCreateAlbumModal = function() {
    document.getElementById('createAlbumModalContent').classList.remove('scale-100', 'opacity-100');
    document.getElementById('createAlbumModalContent').classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        document.getElementById('createAlbumModal').classList.add('hidden');
        document.getElementById('createAlbumForm').reset();
    }, 300);
};

window.handleCreateAlbum = async function(event) {
    event.preventDefault();
    if (!isSupremeAdmin) return;

    const title = document.getElementById('albumTitleInput').value.trim();
    const category = document.getElementById('albumCategoryInput').value;
    const description = document.getElementById('albumDescInput').value.trim();
    const fileInput = document.getElementById('albumCoverFile');

    let coverUrl = 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?q=80&w=800&auto=format&fit=crop';
    if (fileInput.files && fileInput.files[0]) {
        coverUrl = await fileToBase64(fileInput.files[0]);
    }

    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'albums'), {
            title,
            category,
            description,
            coverUrl,
            createdAt: new Date().toISOString()
        });
        closeCreateAlbumModal();
        showToast("¡Álbum creado exitosamente por Admin Supremo!", "success");
    } catch(e) {
        console.error("Error creating album:", e);
        showToast("Error al guardar el álbum en Firestore", "error");
    }
};

window.openUploadModal = function() {
    if (!currentUser || currentUser.isAnonymous) {
        showToast("Debes iniciar sesión con Google para subir fotos", "error");
        return;
    }
    document.getElementById('uploadModal').classList.remove('hidden');
    setTimeout(() => {
        document.getElementById('uploadModalContent').classList.remove('scale-95', 'opacity-0');
        document.getElementById('uploadModalContent').classList.add('scale-100', 'opacity-100');
    }, 10);
};

window.closeUploadModal = function() {
    document.getElementById('uploadModalContent').classList.remove('scale-100', 'opacity-100');
    document.getElementById('uploadModalContent').classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        document.getElementById('uploadModal').classList.add('hidden');
        document.getElementById('uploadForm').reset();
        document.getElementById('previewContainer').classList.add('hidden');
        document.getElementById('dropzoneContent').classList.remove('hidden');
        selectedFileBase64 = null;
    }, 300);
};

window.previewSelectedFile = async function(event) {
    const file = event.target.files[0];
    if (file) {
        selectedFileBase64 = await fileToBase64(file);
        document.getElementById('imagePreview').src = selectedFileBase64;
        document.getElementById('dropzoneContent').classList.add('hidden');
        document.getElementById('previewContainer').classList.remove('hidden');
    }
};

window.handleImageUpload = async function(event) {
    event.preventDefault();
    if (!currentUser || currentUser.isAnonymous) return;

    const title = document.getElementById('imageTitle').value.trim();
    const description = document.getElementById('imageDescription').value.trim();

    if (!selectedFileBase64) {
        showToast("Selecciona una imagen de tu dispositivo", "error");
        return;
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timestamp = `${year}-${month}-${day} ${hours}:${minutes}`;

    const newPost = {
        albumId: currentAlbumId,
        title,
        description,
        authorUid: currentUser.uid,
        authorName: currentUser.displayName || 'Estudiante USUR',
        authorAvatar: currentUser.photoURL || 'https://placehold.co/150',
        timestamp,
        imageUrl: selectedFileBase64
    };

    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'posts'), newPost);
        closeUploadModal();
        showToast("¡Fotografía publicada con éxito!", "success");
    } catch(e) {
        console.error("Error uploading photo:", e);
        showToast("Error al publicar la foto en Firestore", "error");
    }
};

window.openDetailModal = function(postId) {
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    currentSelectedPostId = postId;
    const album = albums.find(a => a.id === post.albumId);

    document.getElementById('detailImage').src = post.imageUrl;
    document.getElementById('detailCategory').innerText = album ? album.title : 'Álbum';
    document.getElementById('detailTitle').innerText = post.title;
    document.getElementById('detailAuthorName').innerText = post.authorName || 'Estudiante';
    document.getElementById('detailAuthorAvatar').src = post.authorAvatar || 'https://placehold.co/150';
    document.getElementById('detailDescription').innerText = post.description;

    try {
        const [datePart, timePart] = post.timestamp.split(' ');
        const [year, month, day] = datePart.split('-');
        const monthsFull = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        document.getElementById('detailTimestamp').innerText = `Publicado el ${day} de ${monthsFull[parseInt(month, 10)-1]} de ${year} a las ${timePart} hrs`;
    } catch (e) {
        document.getElementById('detailTimestamp').innerText = post.timestamp;
    }

    const deleteBtn = document.getElementById('deletePhotoBtn');
    if (isSupremeAdmin) {
        deleteBtn.classList.remove('hidden');
    } else {
        deleteBtn.classList.add('hidden');
    }

    const modal = document.getElementById('detailModal');
    const content = document.getElementById('detailModalContent');
    modal.classList.remove('hidden');
    setTimeout(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    }, 10);
};

window.closeDetailModal = function() {
    const modal = document.getElementById('detailModal');
    const content = document.getElementById('detailModalContent');
    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        currentSelectedPostId = null;
    }, 300);
};

window.deleteCurrentPost = async function() {
    if (!isSupremeAdmin) {
        showToast("Acceso restringido: Solo el Admin Supremo puede eliminar fotos", "error");
        return;
    }
    if (confirm('¿Estás seguro de que deseas eliminar esta fotografía permanentemente?')) {
        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'posts', currentSelectedPostId));
            closeDetailModal();
            showToast("Fotografía eliminada por Admin Supremo", "success");
        } catch(e) {
            console.error("Error deleting post:", e);
            showToast("Error al eliminar la fotografía", "error");
        }
    }
};

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const toastIcon = document.getElementById('toastIcon');

    toastMessage.innerText = message;
    toastIcon.className = type === 'error' ? 'fa-solid fa-circle-exclamation text-rose-400' : 'fa-solid fa-circle-check text-emerald-400';

    toast.classList.remove('translate-y-20', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 3500);
}
