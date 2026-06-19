import { loginAction } from './actions';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; inscription?: string };
}): JSX.Element {
  return (
    <main>
      <h1>Se connecter</h1>
      {searchParams.inscription === 'ok' ? <p>Compte créé. Tu peux te connecter.</p> : null}
      <form action={loginAction}>
        <label htmlFor="email">Courriel</label>
        <input id="email" name="email" type="email" required autoComplete="email" />

        <label htmlFor="password">Mot de passe</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />

        {searchParams.error ? <p role="alert">{searchParams.error}</p> : null}

        <button type="submit">Se connecter</button>
      </form>
    </main>
  );
}
