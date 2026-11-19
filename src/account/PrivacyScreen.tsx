/**
 * What Wonderbits keeps, in plain words. The same notice a grown-up agrees
 * to when they add a child; if what is stored changes, change this and raise
 * CONSENT_VERSION on the server.
 */

export function PrivacyNotice() {
  return (
    <div className="privacy">
      <h3>What is kept about a child</h3>
      <ul>
        <li>The nickname, picture and PIN you choose for them. The PIN is stored scrambled.</li>
        <li>Their progress: which levels they finished, their stars and badges, and how many tries each took.</li>
        <li>What they make: their islands and puzzles, with the titles they type, and the place they left off in a level.</li>
        <li>What they send to a brother or sister, or show to you.</li>
      </ul>
      <h3>What is not kept</h3>
      <ul>
        <li>No real name, email address, birthday, photo or location of a child. Please choose a nickname that is not their full name.</li>
        <li>No record of every tap. The detailed log of what a child did stays on the device they played on.</li>
        <li>No advertising and no tracking. Nothing is sold or passed to anyone else.</li>
      </ul>
      <h3>What is kept about you</h3>
      <ul>
        <li>Your email address, used to sign you in and, if you leave it on, to tell you when a child shows you something.</li>
        <li>The devices you let in, with a name such as "iPad" and when each was last used.</li>
        <li>When you agreed to this notice.</li>
      </ul>
      <h3>Who can see it</h3>
      <ul>
        <li>You can see everything your children do and make here. Each child sees their own things, and what a brother or sister sends them.</li>
        <li>Nothing a child makes can be seen outside your family.</li>
        <li>The person who runs this copy of Wonderbits can reach the stored data in order to keep the service working.</li>
      </ul>
      <h3>Your controls</h3>
      <ul>
        <li>Download everything kept about a child, at any time.</li>
        <li>Delete a child's profile, or your whole account. It is removed straight away and cannot be brought back.</li>
        <li>Take a device away, change a PIN, or turn off sending between children.</li>
      </ul>
      <p>The only cookies are the ones that keep you, a device and a child signed in.</p>
    </div>
  );
}

export function PrivacyScreen() {
  return (
    <div className="account-page">
      <section className="account-card account-card-wide" aria-labelledby="privacy-title">
        <h1 id="privacy-title" className="account-title">
          What Wonderbits keeps
        </h1>
        <PrivacyNotice />
        <p className="account-foot">
          <a className="btn btn-quiet" href="#/grownup">
            For the grown-up
          </a>
          <a className="btn btn-quiet" href="#/">
            Back to the game
          </a>
        </p>
      </section>
    </div>
  );
}
