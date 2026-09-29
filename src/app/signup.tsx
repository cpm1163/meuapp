import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native"

import { Button } from "@/components/Button"
import { Input } from "@/components/input"

import { Link } from "expo-router"

export default function SignUp(){
    // behavior define como ajustar o layout ao abrir o teclado para evitar que ele cubra o campo de senha.
    // Platform.select define o ajuste ao abrir o teclado: "padding" no iOS e "height" no Android.
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
                        <Input placeholder="Nome" />
                        <Input placeholder="E-mail" keyboardType="email-address"/>
                        <Input placeholder="Senha" secureTextEntry/>
                        <Input placeholder="Confirmar senha" secureTextEntry/>
                        <Button label="Cadastrar" />
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