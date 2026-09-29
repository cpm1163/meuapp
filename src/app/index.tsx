import { validateEmail, validateNewPassword } from "@/utils/validation";
import { useState } from "react"; // importa o useState para pode atualizar a tela com var
import {
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    View
} from "react-native";

import { Button } from "@/components/Button";
import { Input } from "@/components/input";

import { Link } from "expo-router";

export default function Index(){
    // Criar uma variável para guardar o input de e-mail :: let email = ""
    // Criar uma variável useState
    const [email, setEmail] = useState("") // [email: nome da função, setEmail é a função]
    const [password, setPassword] = useState("") // [password: nome da função, setPassword é a função]
    
    // behavior define como ajustar o layout ao abrir o teclado para evitar que ele cubra o campo de senha.
    // Platform.select define o ajuste ao abrir o teclado: "padding" no iOS e "height" no Android.
    function handleSignIn(){
        const emailError = validateEmail(email)
        // Aplica os critérios completos de senha antes de continuar.
        const passwordError = validateNewPassword(password);

        if(emailError !== null) {
            return Alert.alert("Entrar", emailError)
        }

        if(passwordError !== null) {
            return Alert.alert("Entrar", passwordError)
        }

        Alert.alert("Entrar", "Campos válidos. Nenhum login foi realizado.");
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
                    <Image source={require("@/assets/img1.png")}
                    style={styles.illustration}
                    />
                    <Text style={styles.title}>Entrar</Text>
                    <Text style={styles.subtitle}>Acesse sua conta com e-mail e senha.</Text>

                    <View style={styles.form}>
                        <Input
                        placeholder="E-mail"
                        keyboardType="email-address"
                        // onChangeText={(text) => setEmail(text)} // executa uma função anônima
                        onChangeText={setEmail} // executa uma função anônima
                        />

                        <Input
                        placeholder="Senha"
                        secureTextEntry
                        value={password}
                        onChangeText={setPassword} // executa uma função anônima
                        />
                        
                        <Button label="Entrar" onPress={handleSignIn} />
                    </View>
                    <Text style={styles.footerText}>
                        Não tem uma conta? {" "}
                        <Link href="/signup" style={styles.footterLink}>Cadastra-se aqui.</Link>
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