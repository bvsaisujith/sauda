import AuthScreen from './screens/AuthScreen';
import HomeScreen from './screens/HomeScreen';
import { useSession } from './session/SessionProvider';

export default function App() {
  const { status } = useSession();

  if (status === 'loading') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-stone-950 text-stone-400">
        <p className="text-sm">Opening Sauda…</p>
      </main>
    );
  }

  if (status === 'signed-out') {
    return <AuthScreen />;
  }

  return <HomeScreen />;
}
