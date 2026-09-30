import { useState } from "react";
import { Pressable, StyleSheet, TextInput, TextInputProps, View } from "react-native";

export function Input({ secureTextEntry, style, editable, ...rest }: TextInputProps) {
    // Cada campo controla sua própria visibilidade e começa com a senha oculta.
    const [passwordVisible, setPasswordVisible] = useState(false);

    if (!secureTextEntry) {
        return (
            <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                {...rest}
                editable={editable}
                style={[styles.input, style]}
            />
        );
    }

    return (
        <View style={styles.container}>
            <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                {...rest}
                editable={editable}
                secureTextEntry={!passwordVisible}
                style={[styles.input, style, styles.passwordInput]}
            />
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${passwordVisible ? "Ocultar" : "Mostrar"} ${rest.placeholder?.toLowerCase() ?? "senha"}`}
                accessibilityState={{ disabled: editable === false }}
                disabled={editable === false}
                onPress={() => setPasswordVisible((visible) => !visible)}
                style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
            >
                <View pointerEvents="none" accessible={false} style={styles.icon}>
                    <View style={styles.eye}>
                        <View style={styles.pupil} />
                    </View>
                    {!passwordVisible && <View style={styles.slash} />}
                </View>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: "100%",
        position: "relative",
    },
    input: {
        width: "100%",
        height: 48,
        borderWidth: 1,
        borderColor: "#DCDCDC",
        borderRadius: 8,
        fontSize: 16,
        paddingLeft: 12,
    },
    passwordInput: {
        paddingRight: 56,
    },
    toggle: {
        position: "absolute",
        right: 0,
        top: 0,
        width: 48,
        height: 48,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
    },
    togglePressed: {
        backgroundColor: "#EAEAEA",
    },
    icon: {
        width: 24,
        height: 24,
        alignItems: "center",
        justifyContent: "center",
    },
    eye: {
        width: 22,
        height: 14,
        borderWidth: 2,
        borderColor: "#585860",
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
    },
    pupil: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: "#585860",
    },
    slash: {
        position: "absolute",
        width: 26,
        height: 2,
        backgroundColor: "#585860",
        transform: [{ rotate: "45deg" }],
    },
});
