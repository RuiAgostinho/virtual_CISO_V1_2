import { Navigate } from "react-router-dom";

// Página legada — agora redireciona para o painel principal.
// O routing em App.tsx já cobre "/" e "*" diretamente; este componente
// existe apenas como salvaguarda caso seja importado em código antigo.
export default function Dashboard() {
  return <Navigate to="/mission-control?mode=executive" replace />;
}
