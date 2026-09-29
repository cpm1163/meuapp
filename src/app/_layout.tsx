import { Stack } from "expo-router";
// Organiza as telas em uma pilha de navegação, permitindo avançar e voltar entre elas.
export default function Layout() {
    return (
        <Stack screenOptions={{
            headerShown: false, // Oculta o cabeçalho padrão da tela.            // headerShown: false
        }}/>
    )
}