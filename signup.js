// Script para página de SIGNUP

let userEmail = '';
let verificationTimer = null;
let lastResendTime = 0;
let resendCooldownTimer = null;
let resendInFlight = false;
const RESEND_COOLDOWN = 3000; // 3 segundos entre reenvios
const VISIBILITY_ICON_EYE = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6-10-6-10-6z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const VISIBILITY_ICON_EYE_OFF = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 3l18 18"></path><path d="M10.6 10.6A3 3 0 0012 15a3 3 0 002.4-4.8"></path><path d="M9.9 5.1A11 11 0 0112 5c6.2 0 10 7 10 7a18.8 18.8 0 01-4 4.7"></path><path d="M6.2 6.2A18.7 18.7 0 002 12s3.8 7 10 7a10.7 10.7 0 005.1-1.2"></path></svg>`;

function calculateAgeFromIsoDate(isoDate) {
    const raw = String(isoDate || '').trim();
    if (!raw) return 0;
    const birth = new Date(`${raw}T00:00:00Z`);
    if (Number.isNaN(birth.getTime())) return 0;

    const now = new Date();
    let age = now.getUTCFullYear() - birth.getUTCFullYear();
    const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) {
        age -= 1;
    }
    return Math.max(0, age);
}

function applyVisibilityToggleState(buttonEl, isVisible, showLabel, hideLabel) {
    if (!buttonEl) return;

    buttonEl.innerHTML = isVisible ? VISIBILITY_ICON_EYE_OFF : VISIBILITY_ICON_EYE;
    buttonEl.setAttribute('aria-pressed', String(isVisible));
    buttonEl.setAttribute('aria-label', isVisible ? hideLabel : showLabel);
    buttonEl.setAttribute('data-tooltip', isVisible ? hideLabel : showLabel);
}

function setupPasswordVisibilityToggles() {
    const pairs = [
        ['togglePassword', 'password'],
        ['toggleConfirmPassword', 'confirmPassword']
    ];

    pairs.forEach(([buttonId, inputId]) => {
        const buttonEl = document.getElementById(buttonId);
        const inputEl = document.getElementById(inputId);
        if (!buttonEl || !inputEl) return;

        const updateState = () => {
            const isVisible = inputEl.type === 'text';
            applyVisibilityToggleState(buttonEl, isVisible, 'Mostrar senha', 'Ocultar senha');
        };

        updateState();

        if (buttonEl.dataset.boundPasswordToggle === '1') return;
        buttonEl.dataset.boundPasswordToggle = '1';

        buttonEl.addEventListener('click', (e) => {
            e.preventDefault();
            inputEl.type = inputEl.type === 'password' ? 'text' : 'password';
            updateState();
        });
    });
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('🔷 Página carregada');
    
    const signupForm = document.getElementById('signupForm');
    const verifyForm = document.getElementById('verifyForm');
    const openTermsModalLink = document.getElementById('openTermsModalLink');
    const termsModal = document.getElementById('termsModal');
    const closeTermsModalBtn = document.getElementById('closeTermsModal');
    const acceptTermsFromModalBtn = document.getElementById('acceptTermsFromModal');
    const termsAcceptedInput = document.getElementById('termsAccepted');
    
    if (!signupForm) {
        console.error('🔴 Formulário de signup não encontrado!');
        return;
    }
    
    console.log('🟢 Elementos encontrados, registrando eventos...');
    
    // Evento de submit do formulário
    signupForm.addEventListener('submit', async (e) => {
        console.log('📤 Formulário enviado');
        e.preventDefault();
        clearErrors();

        const firstName = document.getElementById('firstName').value.trim();
        const lastName = document.getElementById('lastName').value.trim();
        const nickname = document.getElementById('nickname').value.trim();
        const email = document.getElementById('email').value.trim();
        const birthDate = document.getElementById('birthDate').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const termsAccepted = document.getElementById('termsAccepted')?.checked === true;

        console.log('📝 Dados:', {firstName, lastName, nickname, email, birthDate});

        if (!firstName || !lastName || !nickname || !email || !birthDate || !password || !confirmPassword) {
            document.getElementById('formError').textContent = 'Preencha todos os campos';
            console.warn('🔴 Campos vazios');
            return;
        }

        if (firstName.length < 2) {
            document.getElementById('firstNameError').textContent = 'Primeiro nome deve ter pelo menos 2 caracteras';
            return;
        }

        if (lastName.length < 2) {
            document.getElementById('lastNameError').textContent = 'Sobrenome deve ter pelo menos 2 caracteras';
            return;
        }

        if (nickname.length < 1) {
            document.getElementById('nicknameError').textContent = 'Nickname é obrigatório';
            return;
        }

        if (password.length < 6) {
            document.getElementById('passwordError').textContent = 'Senha deve ter no mínimo 6 caracteres';
            return;
        }

        if (password !== confirmPassword) {
            document.getElementById('confirmPasswordError').textContent = 'Senhas não conferem';
            return;
        }

        const age = calculateAgeFromIsoDate(birthDate);
        if (age < 18) {
            document.getElementById('birthDateError').textContent = 'Cadastro permitido apenas para maiores de 18 anos';
            return;
        }

        if (!termsAccepted) {
            document.getElementById('termsAcceptedError').textContent = 'Você precisa aceitar os termos para continuar';
            return;
        }

        console.log('📡 Enviando para servidor...');
        const result = await AuthAPI.register(firstName, lastName, nickname, email, birthDate, password, confirmPassword, termsAccepted);
        console.log('✅ Resposta do servidor:', result);

        if (result.success) {
            AuthAPI.setToken(result.token);
            userEmail = email;
            lastResendTime = Date.now();
            
            console.log('🎉 Usuário criado, mostrando modal');
            document.getElementById('verifyEmail').textContent = email;
            document.getElementById('signupForm').style.display = 'none';
            document.getElementById('verifyModal').style.display = 'flex';
            document.getElementById('verifyError').textContent = '';
            document.getElementById('verificationCode').value = '';
            
            startVerificationTimer();
        } else {
            document.getElementById('formError').textContent = result.message || 'Erro ao criar conta';
            console.error('❌ Erro:', result.message);
        }
    });

    // Evento de verificação de email
    if (verifyForm) {
        verifyForm.addEventListener('submit', async (e) => {
            console.log('✉️ Verificando email');
            e.preventDefault();
            
            const code = document.getElementById('verificationCode').value.trim();
            
            if (!code || code.length !== 6) {
                document.getElementById('verifyError').textContent = 'Insira um código válido com 6 dígitos';
                return;
            }
            
            console.log('📨 Enviando código:', code);
            const result = await AuthAPI.verifyEmail(userEmail, code);
            console.log('Resposta:', result);
            
            if (result.success) {
                clearVerificationTimer();
                window.location.href = 'profile.html';
            } else {
                document.getElementById('verifyError').textContent = result.message || 'Código inválido ou expirado';
                console.error('Erro:', result.message);
            }
        });
    }

    // Setup password visibility toggles
    setupPasswordVisibilityToggles();

    const openTermsModal = () => {
        if (!termsModal) return;
        termsModal.style.display = 'flex';
    };

    const closeTermsModal = () => {
        if (!termsModal) return;
        termsModal.style.display = 'none';
    };

    openTermsModalLink?.addEventListener('click', (event) => {
        event.preventDefault();
        openTermsModal();
    });

    closeTermsModalBtn?.addEventListener('click', () => {
        closeTermsModal();
    });

    acceptTermsFromModalBtn?.addEventListener('click', () => {
        if (termsAcceptedInput) termsAcceptedInput.checked = true;
        closeTermsModal();
    });

    termsModal?.addEventListener('click', (event) => {
        if (event.target === termsModal) {
            closeTermsModal();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && termsModal && termsModal.style.display === 'flex') {
            closeTermsModal();
        }
    });

    console.log('✅ Eventos registrados com sucesso');
});

function startVerificationTimer() {
    let timeLeft = 600;
    const timerElement = document.getElementById('verificationTimer');
    const resendBtn = document.getElementById('resendBtn');
    
    if (!timerElement || !resendBtn) {
        console.warn('Elementos de timer não encontrados');
        return;
    }

    updateTimerDisplay(timeLeft, timerElement);
    
    verificationTimer = setInterval(() => {
        timeLeft--;
        updateTimerDisplay(timeLeft, timerElement);
        
        if (timeLeft <= 0) {
            clearVerificationTimer();
            resendBtn.disabled = false;
            timerElement.textContent = 'Código expirado';
        }
    }, 1000);
}

function updateTimerDisplay(seconds, element) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    element.textContent = `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

function clearVerificationTimer() {
    if (verificationTimer) {
        clearInterval(verificationTimer);
        verificationTimer = null;
    }
}

function clearErrors() {
    const errorElements = document.querySelectorAll('.error-message');
    errorElements.forEach(el => {
        el.textContent = '';
    });
}

function resendVerificationCode() {
    const now = Date.now();
    const resendBtn = document.getElementById('resendBtn');
    const verifyError = document.getElementById('verifyError');

    if (!userEmail) {
        if (verifyError) verifyError.textContent = 'E-mail não encontrado para reenviar o código.';
        return;
    }

    if (resendInFlight) return;

    const timeSinceLastResend = now - lastResendTime;
    if (timeSinceLastResend < RESEND_COOLDOWN) {
        const secondsLeft = Math.ceil((RESEND_COOLDOWN - timeSinceLastResend) / 1000);
        if (verifyError) verifyError.textContent = `Aguarde ${secondsLeft}s antes de reenviar`;
        return;
    }

    if (resendBtn) {
        resendBtn.disabled = true;
        resendBtn.style.opacity = '0.65';
        resendBtn.textContent = 'Reenviando...';
    }
    resendInFlight = true;
    if (verifyError) {
        verifyError.textContent = 'Enviando novo código...';
        verifyError.style.color = '#fbbf24';
    }

    console.log('📨 Reenviando código para:', userEmail);

    AuthAPI.resendVerification(userEmail)
        .then(result => {
            if (result.success) {
                lastResendTime = Date.now();
                if (verifyError) {
                    verifyError.textContent = 'Código reenviado com sucesso!';
                    verifyError.style.color = '#22c55e';
                }
                startResendCooldown(resendBtn);
            } else {
                if (verifyError) {
                    verifyError.textContent = result.message || 'Erro ao reenviar código';
                    verifyError.style.color = '#ef4444';
                }
                if (resendBtn) {
                    resendBtn.disabled = false;
                    resendBtn.style.opacity = '1';
                    resendBtn.textContent = 'Reenviar Código';
                }
            }
        })
        .catch(error => {
            console.error('Erro ao reenviar verificação:', error);
            if (verifyError) {
                verifyError.textContent = 'Erro ao reenviar código';
                verifyError.style.color = '#ef4444';
            }
            if (resendBtn) {
                resendBtn.disabled = false;
                resendBtn.style.opacity = '1';
                resendBtn.textContent = 'Reenviar Código';
            }
        })
        .finally(() => {
            resendInFlight = false;
        });
}

function startResendCooldown(button) {
    if (!button) return;

    clearInterval(resendCooldownTimer);
    let secondsLeft = Math.ceil(RESEND_COOLDOWN / 1000);

    const updateLabel = () => {
        button.disabled = true;
        button.style.opacity = '0.65';
        button.textContent = `Reenviar em ${secondsLeft}s`;
    };

    updateLabel();
    resendCooldownTimer = setInterval(() => {
        secondsLeft -= 1;
        if (secondsLeft <= 0) {
            clearInterval(resendCooldownTimer);
            resendCooldownTimer = null;
            button.disabled = false;
            button.style.opacity = '1';
            button.textContent = 'Reenviar Código';
            return;
        }
        updateLabel();
    }, 1000);
}
