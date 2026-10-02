import { validateEmail } from "@/utils/validation";
import { useEffect, useRef, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { Input } from "@/components/input";
import { Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { authErrorMessage, sendMagicLink, signInWithSocialProvider, socialProviders, type SocialProvider } from "@/lib/auth";

export default function Index() {
    const insets = useSafeAreaInsets();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [mode, setMode] = useState<"password" | "magic">("password");
    const [loading, setLoading] = useState<string | null>(null);
    const busy = useRef(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [cooldown, setCooldown] = useState(0);

    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
        return () => clearTimeout(timer);
    }, [cooldown]);

    async function run(action: string, operation: () => Promise<void>) {
        if (busy.current) return;
        busy.current = true;
        setLoading(action);
        setError("");
        setMessage("");
        try { await operation(); }
        catch (error) { setError(authErrorMessage(error)); }
        finally { busy.current = false; setLoading(null); }
    }

    function handleSignIn() {
        if (busy.current) return;
        const validation = validateEmail(email);
        if (validation) { setError(validation); return; }
        if (mode === "magic") {
            if (cooldown > 0) return;
            void run("magic", async () => {
                await sendMagicLink(email);
                setCooldown(60);
                setMessage("Confira sua caixa de entrada e o spam. Abra o link no mesmo app ou navegador em que você solicitou o acesso. Se ainda não tem conta, ela será criada.");
            });
        } else {
            if (!password) { setError("Informe sua senha."); return; }
            void run("password", async () => {
                const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
                if (error) throw error;
            });
        }
    }

    function handleSocial(provider: SocialProvider) {
        void run(provider, () => signInWithSocialProvider(provider));
    }

    return (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.select({ ios: "padding", android: "height" })}>
            <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
                <View style={[styles.container, { paddingBottom: 32 + insets.bottom }]}>
                    <Image source={require("@/assets/img1.png")} style={styles.illustration} />
                    <Text style={styles.title}>Entrar</Text>
                    <Text style={styles.subtitle}>{mode === "magic" ? "Receba um link por e-mail para entrar ou criar sua conta." : "Acesse sua conta com e-mail e senha."}</Text>
                    <View style={styles.form}>
                        <Input placeholder="E-mail" accessibilityLabel="E-mail" keyboardType="email-address" value={email} onChangeText={setEmail} editable={!loading} autoComplete="email" />
                        {mode === "password" && <Input placeholder="Senha" accessibilityLabel="Senha" secureTextEntry value={password} onChangeText={setPassword} editable={!loading} autoComplete="current-password" />}
                        {!!error && <Text accessibilityRole="alert" style={{ color: "#B42318" }}>{error}</Text>}
                        {!!message && <Text accessibilityLiveRegion="polite">{message}</Text>}
                        <Button
                            label={loading === "password" || loading === "magic" ? "Aguarde..." : mode === "password" ? "Entrar" : cooldown > 0 ? `Reenviar em ${cooldown}s` : "Enviar link de acesso"}
                            disabled={!!loading || (mode === "magic" && cooldown > 0)} onPress={handleSignIn}
                        />
                        <Button label={mode === "password" ? "Entrar sem senha (magic link)" : "Usar e-mail e senha"} disabled={!!loading} onPress={() => {
                            setMode(mode === "password" ? "magic" : "password"); setError(""); setMessage("");
                        }} />
                        <Text style={{ textAlign: "center" }}>ou</Text>
                        {socialProviders.map((provider) => <Button key={provider.id} label={loading === provider.id ? "Abrindo..." : `Continuar com ${provider.label}`} disabled={!!loading} onPress={() => handleSocial(provider.id)} />)}
                    </View>
                    <Text style={styles.footerText}>Não tem uma conta? <Link href="/signup" style={styles.footterLink}>Cadastre-se aqui.</Link></Text>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
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