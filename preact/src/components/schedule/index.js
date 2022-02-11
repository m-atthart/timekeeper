import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import style from "./style.css";
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

const Schedule = ({ firebaseApp, db, lastClockTime }) => {
	const initialPayDate = new Date("2022-01-08");
	const twoWksInMs = 12096e5;
	const [payPeriod, setPayPeriod] = useState(null);
	const [payPeriods, setPayPeriods] = useState([]);
	const [sched, setSched] = useState([]);

	const formatDate = (date) => {
		return date.toJSON().split("T")[0].split("-").join("/");
		/*
		const parts = new Intl.DateTimeFormat("CA", {
			timeZone: "Etc/UTC",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).formatToParts(date);
		const year = parts.find((part) => part.type === "year").value;
		const month = parts.find((part) => part.type === "month").value;
		const day = parts.find((part) => part.type === "day").value;
		return `${year}-${month}-${day}`;
		*/
	};
	const formatTime = (time) => {
		return time
			? time
					.toLocaleString("CA", { timeZone: "America/New_York" })
					.split(", ")[1]
					.split(":")
					.slice(0, 2)
					.join(":")
			: "";
	};

	const updateSchedule = async (startDate, endDate) => {
		const q = query(
			collection(db, "timeclock"),
			where("clockedIn", ">=", Timestamp.fromDate(startDate)),
			where("clockedIn", "<=", Timestamp.fromDate(endDate)),
			orderBy("clockedIn", "asc")
		);
		const snap = await getDocs(q);

		setSched(
			snap.docs.map((doc) => {
				const data = doc.data();
				data.hours = data.clockedOut
					? parseFloat(((data.clockedOut - data.clockedIn) / 3600).toFixed(2))
					: 0;
				return data;
			})
		);
	};

	const getOptions = () => {
		const options = [];
		while (initialPayDate < new Date()) {
			options.unshift([
				new Date(initialPayDate).toJSON(),
				new Date(new Date(initialPayDate.getTime() + twoWksInMs) - 1).toJSON(),
			]);
			initialPayDate.setDate(initialPayDate.getDate() + 14);
		}
		setPayPeriods(options);
	};
	useEffect(() => {
		getOptions();
	}, []);
	useEffect(() => {
		setPayPeriod(payPeriods[0]);
	}, [payPeriods]);
	useEffect(() => {
		if (payPeriod)
			updateSchedule(new Date(payPeriod[0]), new Date(payPeriod[1]));
	}, [payPeriod]);
	useEffect(() => {
		console.log(sched);
		console.log(sched.reduce((acc, curr) => acc + curr.hours, 0));
	}, [sched]);

	return (
		<>
			<select onChange={(e) => setPayPeriod(e.target.value.split(","))}>
				{payPeriods.map((period) => (
					<option value={period} selected={period === payPeriod}>{`${formatDate(
						new Date(period[0])
					)}-${formatDate(new Date(period[1]))}`}</option>
				))}
			</select>
			<h3>Total: {sched.reduce((acc, curr) => acc + curr.hours, 0)}</h3>
			<div class={style.schedule}>
				{sched.map((clock) => (
					<div class={style.clock}>
						<p>{formatDate(clock.clockedIn.toDate())}</p>
						<p>{`${formatTime(clock.clockedIn.toDate())}-${formatTime(
							clock.clockedOut?.toDate()
						)}`}</p>
						<p>{clock.hours}</p>
						<p>{clock.notes}</p>
					</div>
				))}
			</div>
		</>
	);
};

export default Schedule;
