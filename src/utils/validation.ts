// Verifica se o e-mail foi preenchido e possui um formato básico válido.
// Retorna uma mensagem de erro ou null quando passa nas verificações.
export function validateEmail(email: string): string | null {
    const emailFormatado = email.trim();

    if (emailFormatado === "") {
        return "Informe seu e-mail.";
    }

    const formatoEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!formatoEmail.test(emailFormatado)) {
        return "Informe um e-mail válido, como nome@dominio.com";
    }

    return null;
}

// Valida os critérios de senha do projeto: mínimo de 12 caracteres,
// uma maiúscula, uma minúscula, um número e um símbolo.
// Retorna uma mensagem de erro ou null quando a senha é válida.
export function validateNewPassword(password: string): string | null {
    if (password.trim() === "") {
        return "Informe uma senha.";
    }

    if (password.length < 12) {
        return "Use pelo menos 12 caracteres.";
    }

    // As categorias Unicode também reconhecem letras acentuadas.
    if (!/\p{Lu}/u.test(password)) {
        return "Inclua pelo menos uma letra maiúscula.";
    }

    if (!/\p{Ll}/u.test(password)) {
        return "Inclua pelo menos uma letra minúscula.";
    }

    if (!/[0-9]/.test(password)) {
        return "Inclua pelo menos um número de 0 a 9.";
    }

    // Aceita pontuação e símbolos; espaços não contam como símbolo.
    if (!/[\p{P}\p{S}]/u.test(password)) {
        return "Inclua pelo menos um símbolo, como !, @ ou #.";
    }

    return null;
}

// Verifica se a confirmação foi preenchida e é igual à senha.
// Retorna uma mensagem de erro ou null quando as duas coincidem.
export function validatePasswordConfirmation(
    password: string,
    confirmPassword: string
): string | null {
    if (confirmPassword.trim() === "") {
        return "Confirme sua senha.";
    }

    if (confirmPassword !== password) {
        return "As senhas não coincidem.";
    }

    return null;
}

// Verifica se o nome foi preenchido.
// Retorna uma mensagem de erro ou null quando estiver válido.
// Valida os critérios do nome do projeto: mínimo de 3 caracteres,

export function validateName(name: string): string | null {
    const formattedName = name.trim();

    if (formattedName === "") {
        return "Informe seu nome.";
    }

    if (formattedName.length < 3) {
        return "O nome deve ter pelo menos 3 caracteres.";
    }

    return null;
}