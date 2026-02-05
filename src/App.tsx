import { useState } from "react";
// import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    setGreetMsg(await invoke("greet", { name }));
  }

  return (
    <div className="text-3xl font-bold text-purple-600 p-6 bg-gray-100 dark:bg-gray-900">
      Tailwind v4 is working! 🎉
    </div>
  );
}

export default App;
