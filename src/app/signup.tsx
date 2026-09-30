import { useState } from "react"; // importa o useState para pode atualizar a tela com var
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { Input } from "@/components/input";
import { getAuthRedirectUrl } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
    validateEmail,
    validateName,
    validateNewPassword,
    validatePasswordConfirmation,
} from "@/utils/validation";

import { Link } from "expo-router";

export default function SignUp(){
    // behavior define como ajustar o layout ao abrir o teclado para evitar que ele cubra o campo de senha.
    // Platform.select define o ajuste ao abrir o teclado: "padding" no iOS e "height" no Android.
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);

    // Valida os campos em ordem e interrompe no primeiro erro.
    //function handleSignUp() {
    async function handleSignUp() {
        const nameError = validateName(name);
        //usar o estado loading para impedir cadastros duplicados
        if (loading) return;

        if (nameError !== null) {
            return Alert.alert("Cadastrar", nameError);
        }

        const emailError = validateEmail(email);
        if (emailError !== null) {
            return Alert.alert("Cadastrar", emailError);
        }

        const passwordError = validateNewPassword(password);
        if (passwordError !== null) {
            return Alert.alert("Cadastrar", passwordError);
        }

        const confirmationError = validatePasswordConfirmation(password, confirmPassword);
        if (confirmationError !== null) {
            return Alert.alert("Cadastrar", confirmationError);
        }

        // Esta etapa apenas valida os dados, sem criar uma conta.
        //Alert.alert("Cadastrar", "Campos válidos. Nenhum cadastro foi salvo.");

        setLoading(true);

        try {
        const { data, error } = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
            emailRedirectTo: getAuthRedirectUrl(),
            data: {
                name: name.trim(),
            },
            },
        });

        if (error) {
            const messages: Record<string, string> = {
                user_already_exists: "Este e-mail já está cadastrado. Entre na sua conta.",
                email_exists: "Este e-mail já está cadastrado. Entre na sua conta.",
                over_email_send_rate_limit: "O limite de envio de e-mails foi atingido. Aguarde antes de tentar novamente.",
                over_request_rate_limit: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.",
                email_address_invalid: "Confira o endereço de e-mail informado.",
                email_address_not_authorized: "O envio para este endereço de e-mail ainda não está habilitado. Entre em contato com o suporte.",
                weak_password: "A senha não atende aos requisitos de segurança. Escolha uma senha mais forte.",
                signup_disabled: "O cadastro de novas contas está temporariamente indisponível.",
            };
            const message = messages[error.code ?? ""]
                ?? "Não foi possível concluir o cadastro. Tente novamente mais tarde.";

            if (__DEV__) {
                console.warn("Falha no cadastro Supabase", {
                    code: error.code,
                    status: error.status,
                    message: error.message,
                });
            }

            Alert.alert("Cadastrar", `Erro no cadastro do e-mail ${email.trim()}.\n\n${message}`);
            return;
        }

        Alert.alert(
            "Cadastrar",
            data.session
            ? `Cadastro realizado com sucesso para ${email.trim()}.`
            : `Cadastro realizado com sucesso para ${email.trim()}. Confira sua caixa de entrada para confirmar o e-mail.`
        );
        } catch {
        Alert.alert(
            "Cadastrar",
            `Erro no cadastro do e-mail ${email.trim()}. Não foi possível conectar. Verifique sua conexão e tente novamente.`
        );
        } finally {
        setLoading(false);
        }


    }

    return (
        <KeyboardAvoidingView style={{ flex:1}} behavior={Platform.select({ ios: "padding", android: "height" })}>
            <ScrollView
                //- **`flexGrow: 1`**: faz o conteúdo ocupar todo o espaço disponível, mantendo a rolagem se necessário.
                // - **`keyboardShouldPersistTaps="handled"`**: permite acionar botões com o teclado aberto; tocar fora deles fecha o teclado.
                // **showsHorizontalScrollIndicator**={false} desabilita a barra de scroll lateral
               contentContainerStyle={{ flexGrow: 1}}
                keyboardShouldPersistTaps="handled"
                showsHorizontalScrollIndicator={false}
            >
                <View style={styles.container}>
                    <Image source={require("@/assets/img2.png")}
                    style={styles.illustration}
                    />
                    <Text style={styles.title}>Cadastrar</Text>
                    <Text style={styles.subtitle}>Crie sua conta para acessar</Text>

                    <View style={styles.form}>
                        <Input
                        placeholder="Nome"
                        value={name}
                        onChangeText={setName}
                        />

                        <Input
                        placeholder="E-mail"
                        keyboardType="email-address"
                        value={email}
                        onChangeText={setEmail}
                        />

                        <Input
                        placeholder="Senha"
                        secureTextEntry
                        value={password}
                        onChangeText={setPassword}
                        />

                        <Input
                        placeholder="Confirmar senha"
                        secureTextEntry
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        />

                        <Button
                        label={loading ? "Cadastrando..." : "Cadastrar"}
                        onPress={handleSignUp}
                        disabled={loading}
                        />

                    </View>
                    <Text style={styles.footerText}>
                        Já tem uma conta? {" "}
                        <Link href="/" style={styles.footterLink}>Entre aqui.</Link>
                    </Text>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>

    )
}
const styles = StyleSheet.create({
    container: {
        flex:1,
        backgroundColor: "#fdfdfd",
        padding: 32,
    },
    illustration: {
        width: "100%",
        height: 330,
        resizeMode: "contain",
        marginTop: 62,
    },
    title: {
        fontSize: 32,
        fontWeight: 900,
    },
    subtitle: {
        fontSize: 16,
    },
    form: {
        marginTop: 24,
        gap: 12,
    },
    footerText: {
        textAlign: "center",
        marginTop: 24,
        color: "#585860",

    },
    footterLink: {
        color: "#032ad7",
        fontWeight: 700,
    }
})
