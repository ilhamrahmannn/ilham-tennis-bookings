import { lazy, Suspense, useEffect, useState } from "react";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { collection, doc, onSnapshot, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import "./forehand.css";

const Simulator = lazy(() => import("./ForehandSimulator.jsx"));
const paymentRef = doc(db, "forehandSettings", "payment");
const accessRef = (uid) => doc(db, "forehandAccess", uid);
const ringgit = (sen) => new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(sen / 100);
const button = "rounded-xl bg-lime-300 px-4 py-2 font-semibold text-neutral-950 disabled:opacity-50";
const field = "w-full rounded-xl border border-neutral-700 bg-neutral-950 p-3 text-white";
const panel = "rounded-3xl border border-neutral-800 bg-neutral-900 p-5 sm:p-7";

function PaymentForm({ user, profile, payment }) {
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const name = profile?.fullName || user.displayName || "";

  async function submit(event) {
    event.preventDefault();
    if (reference.trim().length < 3) {
      setError("Enter the transaction reference from your banking app.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await runTransaction(db, async (transaction) => {
        const ref = accessRef(user.uid);
        const existing = await transaction.get(ref);
        const currentPayment = (await transaction.get(paymentRef)).data();
        if (existing.exists() && existing.data().status !== "rejected") {
          throw new Error("You already have an access request.");
        }
        if (!currentPayment?.updatedAt?.isEqual(payment.updatedAt)) {
          throw new Error("The payment details changed. Contact Coach Ilham if you already paid.");
        }
        transaction.set(ref, {
          name: name.slice(0, 120),
          email: user.email,
          reference: reference.trim(),
          amountSen: payment.amountSen,
          paymentVersion: payment.updatedAt,
          status: "pending",
          submittedAt: serverTimestamp(),
        });
      });
    } catch (failure) {
      setError(failure.code ? "Could not submit your payment reference. Try again." : failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-[15rem_1fr]">
      <div>
        <img src={payment.qr} alt="Coach Ilham’s payment QR code" className="w-60 rounded-xl bg-white p-3" />
        <a href={payment.qr} download="forehand-payment-qr" className="mt-2 inline-block text-sm text-lime-300 underline">Download QR</a>
      </div>
      <div className="grid content-start gap-3">
        <p className="text-xl font-semibold">{ringgit(payment.amountSen)}</p>
        <p>Scan the QR in your banking app and enter the transaction reference after paying.</p>
        <p className="break-all text-sm text-neutral-400">Account: {name ? name + " · " : ""}{user.email}</p>
        <label>Transaction reference
          <input className={field} value={reference} onChange={(event) => setReference(event.target.value)} minLength={3} maxLength={120} required />
        </label>
        <button className={button} disabled={busy}>{busy ? "Submitting…" : "Submit payment reference"}</button>
        {error && <p role="alert" className="text-rose-300">{error}</p>}
      </div>
    </form>
  );
}

function SignedInAccess({ user, profile }) {
  const [payment, setPayment] = useState(null);
  const [access, setAccess] = useState(undefined);
  const [error, setError] = useState("");
  const [paymentError, setPaymentError] = useState("");

  useEffect(() => {
    const stopPayment = onSnapshot(paymentRef, (snapshot) => setPayment(snapshot.data() || null),
      () => setPaymentError("Could not load payment details. Reload this page to try again."));
    const stopAccess = onSnapshot(accessRef(user.uid), (snapshot) => setAccess(snapshot.data() || null),
      () => {
        setAccess(undefined);
        setError("Could not check your access. Reload this page to try again.");
      });
    return () => { stopPayment(); stopAccess(); };
  }, [user.uid]);

  if (error) return <p role="alert">{error}</p>;
  if (access === undefined) return <p role="status">Checking access…</p>;
  if (access?.status === "approved") {
    return <Suspense fallback={<p role="status">Loading simulator…</p>}><Simulator user={user} /></Suspense>;
  }
  if (access?.status === "pending") {
    return <div role="status"><h2 className="text-xl font-bold">Awaiting approval</h2><p className="mt-2">Coach Ilham will check your payment. This page unlocks once your request is approved.</p></div>;
  }
  return (
    <>
      {access?.status === "rejected" && <p role="status" className="mb-4 text-amber-300">Your payment could not be verified. Check your transaction reference or contact Coach Ilham before paying again.</p>}
      <h2 className="text-xl font-bold">Unlock the simulator</h2>
      {paymentError ? <p role="alert" className="mt-2">{paymentError}</p> : payment?.qr && payment.amountSen > 0
        ? <PaymentForm user={user} profile={profile} payment={payment} />
        : <p className="mt-2">Payment details will appear here once Coach Ilham sets them up.</p>}
    </>
  );
}

export function ForehandPage({ user, profile, loading }) {
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => { document.title = "Forehand 3D | COACH IN ACTION"; }, []);

  async function login() {
    setError("");
    setSigningIn(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
    } catch {
      setError("Google sign-in was not completed. Please try again.");
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <main className="forehand-page min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
        <header className="mb-12 flex flex-wrap items-center justify-between gap-4">
          <a href="/" className="font-bold text-lime-300">COACH IN ACTION</a>
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            <a href="/" className="hover:text-lime-300">Home</a>
            {user && <button type="button" onClick={() => signOut(auth).catch(() => setError("Could not sign out. Try again."))} className="hover:text-lime-300">Sign out</button>}
          </nav>
        </header>
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">Forehand <span className="text-lime-300">3D</span></h1>
        <p className="my-5 max-w-2xl text-lg text-neutral-300">Study a right-handed tennis forehand from ready position to preparation, execution and follow-through.</p>
        <section className={panel}>
          {loading ? <p role="status">Checking your account…</p> : user?.email
            ? <SignedInAccess user={user} profile={profile} />
            : <><p className="mb-4">Sign in with Google to pay and request access.</p><button className={button} onClick={login} disabled={signingIn}>{signingIn ? "Signing in…" : "Sign in with Google"}</button></>}
          {error && <p role="alert" className="mt-3 text-rose-300">{error}</p>}
        </section>
      </div>
    </main>
  );
}

export function ForehandAdmin() {
  const [payment, setPayment] = useState(null);
  const [requests, setRequests] = useState([]);
  const [amount, setAmount] = useState("");
  const [qrFile, setQrFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const stopPayment = onSnapshot(paymentRef, (snapshot) => {
      const details = snapshot.data() || null;
      setPayment(details);
      setAmount(details ? (details.amountSen / 100).toFixed(2) : "");
    }, () => setMessage("Could not load the Forehand payment settings."));
    const stopRequests = onSnapshot(collection(db, "forehandAccess"), (snapshot) => {
      const records = snapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
      setRequests(records.sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0)));
    }, () => setMessage("Could not load Forehand access requests."));
    return () => { stopPayment(); stopRequests(); };
  }, []);

  async function savePayment(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const amountSen = Math.round(Number(amount) * 100);
    if (!Number.isSafeInteger(amountSen) || amountSen <= 0 || (!qrFile && !payment?.qr)) {
      setMessage("Enter a positive price and add your payment QR.");
      return;
    }
    if (qrFile && (!["image/png", "image/jpeg", "image/webp"].includes(qrFile.type) || qrFile.size > 500_000)) {
      setMessage("Choose a PNG, JPEG or WebP QR image up to 500 KB.");
      return;
    }
    setBusy(true);
    try {
      const qr = qrFile ? await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(qrFile);
      }) : payment.qr;
      await setDoc(paymentRef, { qr, amountSen, updatedAt: serverTimestamp() });
      form.reset();
      setQrFile(null);
      setMessage("Payment settings saved.");
    } catch {
      setMessage("Could not save payment settings. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function review(record, status) {
    setBusy(true);
    try {
      await runTransaction(db, async (transaction) => {
        const ref = accessRef(record.id);
        const current = (await transaction.get(ref)).data();
        if (current?.status !== "pending" || !current.submittedAt?.isEqual(record.submittedAt)) {
          throw new Error("This request has changed.");
        }
        transaction.update(ref, { status, reviewedAt: serverTimestamp() });
      });
      setMessage(status === "approved" ? "Access approved." : "Payment marked as unverified.");
    } catch {
      setMessage("Could not review this request. Check the latest status and try again.");
    } finally {
      setBusy(false);
    }
  }

  const pending = requests.filter((record) => record.status === "pending").length;
  return (
    <details className={panel + " my-5"}>
      <summary className="cursor-pointer text-xl font-bold">Forehand 3D payments{pending > 0 ? " · " + pending + " pending" : ""}</summary>
      <form onSubmit={savePayment} className="mt-4 flex flex-wrap items-end gap-4">
        {payment?.qr && <img src={payment.qr} alt="Current payment QR" className="w-24 rounded-lg bg-white p-1" />}
        <label>Price (RM)<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required className={field} /></label>
        <label>Payment QR image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setQrFile(event.target.files[0] || null)} className={field} /></label>
        <button className={button} disabled={busy}>Save payment settings</button>
      </form>
      <h3 className="mt-6 font-bold">Access requests</h3>
      <p className="mb-3 text-sm text-neutral-400">Match the transaction reference and amount against your bank records before approving.</p>
      {requests.length === 0 && <p>No requests yet.</p>}
      {requests.map((record) => (
        <div key={record.id} className="grid gap-2 border-t border-neutral-700 py-3 sm:grid-cols-[1fr_auto]">
          <div className="min-w-0 break-words">
            <p className="font-semibold">{record.name || record.email} · {ringgit(record.amountSen)}</p>
            <p className="text-sm text-neutral-300">{record.email} · Ref {record.reference}</p>
            <p className="text-sm capitalize text-neutral-400">{record.status} {record.submittedAt && "· " + record.submittedAt.toDate().toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}</p>
          </div>
          {record.status === "pending" && <div className="flex flex-wrap items-center gap-2">
            <button className={button} disabled={busy} onClick={() => review(record, "approved")}>Approve access</button>
            <button className="rounded-xl border border-neutral-700 px-3 py-2" disabled={busy} onClick={() => review(record, "rejected")}>Mark unverified</button>
          </div>}
        </div>
      ))}
      {message && <p role="status" className="mt-3 text-lime-300">{message}</p>}
    </details>
  );
}
