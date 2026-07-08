import { useEffect } from "react";
import AppShell from "./components/layout/AppShell";
import { initUrlSync } from "./utils/urlSync";

function App() {
  useEffect(() => {
    const cleanup = initUrlSync();
    return cleanup;
  }, []);

  return <AppShell />;
}

export default App;
