(function () {
    "use strict";

    const USERS_KEY = "snake_arcade_users";
    const SESSION_KEY = "snake_arcade_session";

    // Lightweight hash — enough to avoid storing plain text in localStorage.
    // NOT a security measure; this is a client-only demo app.
    function hash(str) {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
        }
        return h.toString(16).padStart(8, "0");
    }

    function loadUsers() {
        try {
            return JSON.parse(localStorage.getItem(USERS_KEY)) || {};
        } catch {
            return {};
        }
    }

    function saveUsers(users) {
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }

    function setSession(username) {
        localStorage.setItem(SESSION_KEY, username);
    }

    function clearSession() {
        localStorage.removeItem(SESSION_KEY);
    }

    function currentUser() {
        return localStorage.getItem(SESSION_KEY);
    }

    function login(username, password) {
        const users = loadUsers();
        const key = username.toLowerCase();
        const hashed = hash(password);

        if (users[key]) {
            if (users[key].password !== hashed) {
                return { ok: false, error: "Wrong password for that username." };
            }
        } else {
            users[key] = { username, password: hashed, best: 0 };
            saveUsers(users);
        }

        setSession(key);
        return { ok: true, user: users[key] };
    }

    function getBest(username) {
        const users = loadUsers();
        return (users[username] && users[username].best) || 0;
    }

    function setBest(username, score) {
        const users = loadUsers();
        if (!users[username]) return;
        if (score > (users[username].best || 0)) {
            users[username].best = score;
            saveUsers(users);
        }
    }

    function getDisplayName(username) {
        const users = loadUsers();
        return (users[username] && users[username].username) || username;
    }

    const loginScreen = document.getElementById("login-screen");
    const gameScreen = document.getElementById("game-screen");
    const loginForm = document.getElementById("login-form");
    const loginError = document.getElementById("login-error");
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const logoutBtn = document.getElementById("logout-btn");
    const playerName = document.getElementById("player-name");
    const bestEl = document.getElementById("best");

    function showGame(username) {
        loginScreen.classList.remove("active");
        gameScreen.classList.add("active");
        playerName.textContent = getDisplayName(username);
        bestEl.textContent = getBest(username);
        window.dispatchEvent(new CustomEvent("auth:login", { detail: { username } }));
    }

    function showLogin() {
        gameScreen.classList.remove("active");
        loginScreen.classList.add("active");
        loginError.textContent = "";
        loginForm.reset();
        usernameInput.focus();
        window.dispatchEvent(new CustomEvent("auth:logout"));
    }

    loginForm.addEventListener("submit", function (event) {
        event.preventDefault();
        loginError.textContent = "";

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (username.length < 2) {
            loginError.textContent = "Username must be at least 2 characters.";
            return;
        }
        if (password.length < 4) {
            loginError.textContent = "Password must be at least 4 characters.";
            return;
        }

        const result = login(username, password);
        if (!result.ok) {
            loginError.textContent = result.error;
            return;
        }

        showGame(username.toLowerCase());
    });

    logoutBtn.addEventListener("click", function () {
        clearSession();
        showLogin();
    });

    // Expose minimal API for the game module.
    window.SnakeAuth = {
        currentUser,
        getBest,
        setBest,
    };

    // Auto-resume session if one exists.
    const existing = currentUser();
    if (existing) {
        showGame(existing);
    } else {
        usernameInput.focus();
    }
})();
