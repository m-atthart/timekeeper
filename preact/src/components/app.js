import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import { initializeApp } from "firebase/app";
import {
	getAuth,
	onAuthStateChanged,
	GoogleAuthProvider,
	signInWithPopup,
} from "firebase/auth";
import {
	getFirestore,
	collection,
	doc,
	query,
	where,
	orderBy,
	limit,
	getDocs,
	addDoc,
	setDoc,
	Timestamp,
} from "firebase/firestore/lite";

const firebaseConfig = {
	apiKey: "AIzaSyBspCVxKITMRu0bRtLczzLduJauUDraQkc",
	authDomain: "timekeeper-338721.firebaseapp.com",
	projectId: "timekeeper-338721",
	storageBucket: "timekeeper-338721.appspot.com",
	messagingSenderId: "89838991753",
	appId: "1:89838991753:web:c1bc561c63955be513c958",
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const authProvider = new GoogleAuthProvider();
const db = getFirestore(firebaseApp);

import Header from "./header";
import Home from "./home";
import Schedule from "./schedule";

const App = () => {
	const [currentUser, setCurrentUser] = useState(null);
	const [clockedIn, setClockedIn] = useState(false);
	const [lastClockTime, setLastClockTime] = useState(null);
	const [client, setClient] = useState(null); //empty obj is truthy
	const [clients, setClients] = useState([]);
	const [notes, setNotes] = useState("");
	const [docId, setDocId] = useState(null);

	onAuthStateChanged(auth, (user) => {
		if (user) {
			setCurrentUser(user);
		} else {
			setCurrentUser(null);
		}
	});

	useEffect(async () => {
		if (currentUser) {
			const q = query(
				collection(db, "clients"),
				where("viewers", "array-contains", currentUser.uid)
			);
			const snap = await getDocs(q);
			setClients(snap.docs.map((doc) => doc.data()));
		}
	}, [currentUser]);

	useEffect(() => {
		setClient(clients[0]);
	}, [clients]);

	useEffect(async () => {
		if (!client) return;
		const q = query(
			collection(db, `clients/${client.code}/timeclock`),
			orderBy("clockedIn", "desc"),
			limit(1)
		);
		const snap = await getDocs(q);
		snap.forEach((doc) => {
			setDocId(doc.id);
			const data = doc.data();
			if (data.clockedOut) {
				setClockedIn(false);
				setLastClockTime(
					data.clockedOut.toDate().toString().split(" ").slice(0, 5).join(" ")
				);
				setNotes("");
			} else {
				setClockedIn(true);
				setLastClockTime(
					data.clockedIn.toDate().toString().split(" ").slice(0, 5).join(" ")
				);
				setNotes(data.notes);
			}
		});
	}, [clockedIn, client]);

	const signIn = () => {
		if (!currentUser) signInWithPopup(auth, authProvider);
	};

	const clockInOut = async () => {
		if (clockedIn) {
			await setDoc(
				doc(db, `clients/${client.code}/timeclock`, docId),
				{
					clockedOut: Timestamp.now(),
					notes,
				},
				{ merge: true }
			);
		} else {
			const docRef = await addDoc(
				collection(db, `clients/${client.code}/timeclock`),
				{
					clockedIn: Timestamp.now(),
					clockedOut: null,
					notes,
				}
			);
			setDocId(docRef.id);
		}
		setNotes("");
		setClockedIn(!clockedIn);
	};

	return (
		<div id="app">
			<Header currentUser={currentUser} signIn={signIn} clockedIn={clockedIn} />
			{["mattevanhart@gmail.com", "stephen.frangulescu@gmail.com"].includes(
				currentUser?.email
			) && (
				<Home
					path="/"
					clockedIn={clockedIn}
					clockInOut={clockInOut}
					lastClockTime={lastClockTime}
					notes={notes}
					setNotes={setNotes}
				/>
			)}
			<Schedule
				db={db}
				client={client}
				setClient={setClient}
				clients={clients}
			></Schedule>
		</div>
	);
};

export default App;
