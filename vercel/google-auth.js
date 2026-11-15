document.addEventListener('DOMContentLoaded', async () => {
    const buttonContainer = document.getElementById('googleSignInButton');
    const status = document.getElementById('googleAuthStatus');
    const profileModal = document.getElementById('googleProfileModal');
    const profileForm = document.getElementById('googleProfileForm');
    const profileTicketInput = document.getElementById('googleNickname');
    const profileError = document.getElementById('googleProfileError');
    const profileSubmit = document.getElementById('completeGoogleProfile');
    const cancelProfileButton = document.getElementById('cancelGoogleProfile');
    const birthDateInput = document.getElementById('googleBirthDate');
    const termsAcceptedInput = document.getElementById('googleTermsAccepted');
    const isLoginPage = Boolean(document.getElementById('loginForm'));
    let googleSignupTicket = '';

    if (!buttonContainer || !status) return;

    const showUnavailableButton = (message) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'google-signin-unavailable';
        button.disabled = true;
        button.textContent = 'Continuar com Google';
        buttonContainer.replaceChildren(button);
        status.textContent = message;
    };

    const closeProfileModal = () => {
        googleSignupTicket = '';
        profileForm?.reset();
        if (profileError) profileError.textContent = '';
        if (profileModal) profileModal.style.display = 'none';
    };

    const submitLoginResult = (result) => {
        if (isLoginPage) {
            window.dispatchEvent(new CustomEvent('holiday:google-login-result', { detail: result }));
            return;
        }

        if (result?.requiresTwoFactor) {
            sessionStorage.setItem('holidayGoogle2faLogin', JSON.stringify(result));
            window.location.href = 'login.html';
            return;
        }

        if (result?.success && result.token) {
            AuthAPI.setToken(result.token);
            window.location.href = 'profile.html';
            return;
        }

        status.textContent = result?.message || 'Não foi possível entrar com Google.';
    };

    if (isLoginPage) {
        const storedResult = sessionStorage.getItem('holidayGoogle2faLogin');
        if (storedResult) {
            sessionStorage.removeItem('holidayGoogle2faLogin');
            try {
                submitLoginResult(JSON.parse(storedResult));
            } catch (error) {
                console.error('Resposta de autenticação Google inválida:', error);
            }
        }
    }

    const handleGoogleCredential = async (credential) => {
        status.textContent = 'Validando sua conta Google...';
        AuthAPI.removeToken();
        const trustedDeviceToken = localStorage.getItem('holidayTrustedDeviceToken') || '';
        const result = await AuthAPI.loginWithGoogle(credential, trustedDeviceToken);

        if (result?.needsProfileCompletion && result.googleSignupTicket) {
            googleSignupTicket = result.googleSignupTicket;
            status.textContent = '';
            if (profileModal) {
                profileModal.style.display = 'flex';
                profileTicketInput?.focus();
            }
            return;
        }

        if (result?.success) {
            status.textContent = '';
            submitLoginResult(result);
            return;
        }

        status.textContent = result?.message || 'Não foi possível entrar com Google.';
    };

    profileForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!googleSignupTicket) {
            profileError.textContent = 'Sessão Google expirada. Tente novamente.';
            closeProfileModal();
            return;
        }
        if (!termsAcceptedInput?.checked) {
            profileError.textContent = 'Você precisa aceitar os Termos de Uso para continuar.';
            return;
        }

        profileSubmit.disabled = true;
        profileError.textContent = '';
        try {
            const result = await AuthAPI.completeGoogleProfile(
                googleSignupTicket,
                profileTicketInput.value.trim(),
                birthDateInput.value,
                termsAcceptedInput.checked
            );
            if (result?.success && result.token) {
                closeProfileModal();
                submitLoginResult(result);
                return;
            }
            profileError.textContent = result?.message || 'Não foi possível criar sua conta.';
        } catch (error) {
            console.error('Erro ao finalizar o cadastro Google:', error);
            profileError.textContent = 'Erro ao conectar ao servidor. Tente novamente.';
        } finally {
            profileSubmit.disabled = false;
        }
    });

    cancelProfileButton?.addEventListener('click', closeProfileModal);
    profileModal?.addEventListener('click', (event) => {
        if (event.target === profileModal) closeProfileModal();
    });

    const config = await AuthAPI.getGoogleAuthConfig();
    if (!config?.success || !config.enabled || !config.clientId) {
        showUnavailableButton(
            config?.message || 'Login Google indisponível. Configure GOOGLE_CLIENT_ID no servidor.'
        );
        return;
    }

    const loadGoogleIdentity = () => new Promise((resolve, reject) => {
        if (window.google?.accounts?.id) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => window.google?.accounts?.id
            ? resolve()
            : reject(new Error('Google Identity Services não ficou disponível.'));
        script.onerror = () => reject(new Error('Não foi possível carregar o login Google.'));
        document.head.appendChild(script);
    });

    try {
        await loadGoogleIdentity();
        window.google.accounts.id.initialize({
            client_id: config.clientId,
            callback: (response) => {
                if (!response?.credential) {
                    status.textContent = 'O Google não retornou uma credencial válida.';
                    return;
                }
                handleGoogleCredential(response.credential).catch((error) => {
                    console.error('Erro no fluxo de login Google:', error);
                    status.textContent = 'Erro ao conectar ao servidor. Tente novamente.';
                });
            }
        });
        const googleButtonWidth = Math.min(
            320,
            Math.max(200, Math.floor(buttonContainer.getBoundingClientRect().width - 26))
        );
        window.google.accounts.id.renderButton(buttonContainer, {
            type: 'standard',
            theme: 'filled_black',
            size: 'large',
            text: 'signin_with',
            shape: 'rect',
            width: googleButtonWidth,
            locale: 'pt-BR'
        });
        status.textContent = '';
    } catch (error) {
        console.error('Erro ao inicializar o botão Google:', error);
        status.textContent = 'Não foi possível carregar o login Google.';
    }

});
