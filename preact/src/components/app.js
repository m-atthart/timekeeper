import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import { Router } from "preact-router";
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

const App = () => {
	const [currentUser, setCurrentUser] = useState(null);
	const [clockedIn, setClockedIn] = useState(false);
	const [lastClockTime, setLastClockTime] = useState(null);
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
				collection(db, "timeclock"),
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
				} else {
					setClockedIn(true);
					setLastClockTime(
						data.clockedIn.toDate().toString().split(" ").slice(0, 5).join(" ")
					);
					setNotes(data.notes);
				}
			});
		} else {
			setClockedIn(false);
			setLastClockTime(null);
			setNotes("");
			setDocId(null);
		}
	}, [clockedIn, currentUser]);

	const signIn = () => {
		if (!currentUser) signInWithPopup(auth, authProvider);
	};

	const clockInOut = async () => {
		if (clockedIn) {
			await setDoc(
				doc(db, "timeclock", docId),
				{
					clockedOut: Timestamp.now(),
					notes,
				},
				{ merge: true }
			);
		} else {
			const docRef = await addDoc(collection(db, "timeclock"), {
				clockedIn: Timestamp.now(),
				clockedOut: null,
				notes,
			});
			setDocId(docRef.id);
		}
		setNotes("");
		setClockedIn(!clockedIn);
	};

	return (
		<div id="app">
			<Header currentUser={currentUser} signIn={signIn} />
			<Router>
				<Home
					path="/"
					clockedIn={clockedIn}
					clockInOut={clockInOut}
					lastClockTime={lastClockTime}
					notes={notes}
					setNotes={setNotes}
				/>
			</Router>
		</div>
	);
};

export default App;
