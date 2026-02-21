import WonderSorobanFlashCard from "./WonderSorobanFlashCard";
import InAppBrowserGuard from "./components/InAppBrowserGuard";

function App() {
  return (
    <div className="w-screen h-screen">
      <InAppBrowserGuard />
      <WonderSorobanFlashCard />
    </div>
  );
}

export default App;
