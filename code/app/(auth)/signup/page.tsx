import { signupAction } from './actions';

export default function SignupPage({
  searchParams,
}: {
  searchParams: { error?: string };
}): JSX.Element {
  return (
    <main>
      <h1>Créer un compte</h1>
      <p>
        Créer un compte n&apos;est jamais obligatoire pour acheter — tu peux toujours passer
        commande sans compte.
      </p>
      <form action={signupAction}>
        <label htmlFor="fullName">Nom complet</label>
        <input id="fullName" name="fullName" type="text" required autoComplete="name" />

        <label htmlFor="email">Courriel</label>
        <input id="email" name="email" type="email" required autoComplete="email" />

        <label htmlFor="password">Mot de passe</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />

        {searchParams.error ? <p role="alert">{searchParams.error}</p> : null}

        <button type="submit">Créer mon compte</button>
      </form>
    </main>
  );
}
