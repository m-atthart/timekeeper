import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import style from "./style.css";
import {
	collection,
	query,
	where,
	orderBy,
	onSnapshot,
	doc,
	setDoc,
	Timestamp,
} from "firebase/firestore";

const Schedule = ({ db, currentUser, client, setClient, clients }) => {
	const payPeriodLength = client.payPeriodLength ?? "biweekly";
	const twoWksInMs = 12096e5;
	const [payPeriod, setPayPeriod] = useState(null); //empty arr is truthy
	const [payPeriods, setPayPeriods] = useState([]);
	const [sched, setSched] = useState([]);

	const generateTimesheet = async (e) => {
		e.preventDefault();

		const clocks = sched.map((clock) => {
			clock.date = formatDateTime(clock.clockedIn.toDate()).numDate;
			clock.startTime = formatDateTime(clock.clockedIn.toDate()).time;
			clock.endTime = formatDateTime(clock.clockedOut?.toDate()).time;
			return clock;
		});

		clocks.push({
			hours: parseFloat(
				clocks.reduce((acc, curr) => acc + curr.hours, 0).toFixed(2)
			),
		});

		const XLSX = await import("xlsx");
		const wb = XLSX.utils.book_new();
		const ws = XLSX.utils.json_to_sheet(clocks, {
			header: ["date", "startTime", "endTime", "hours", "notes"],
		});
		["Date", "Clocked In", "Clocked Out", "Hours", "Notes", "", ""].forEach(
			(header, idx) => (ws[`${String.fromCharCode(65 + idx)}1`].v = header)
		);
		XLSX.utils.book_append_sheet(wb, ws, "Timesheet");

		XLSX.writeFile(
			wb,
			`${currentUser?.displayName}'s Timesheet - ${
				payPeriod[0].split("T")[0]
			} - ${payPeriod[1].split("T")[0]}.xlsx`
		);
	};

	const formatDateTime = (date) => {
		const payPeriodDateOptions = {
			timeZone: "Etc/UTC",
			month: "short",
			day: "numeric",
			year: "numeric",
		};
		const textDateOptions = {
			timeZone: "America/New_York",
			weekday: "short",
			month: "short",
			day: "numeric",
			year: "numeric",
		};
		const numDateOptions = {
			timeZone: "America/New_York",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		};
		const timeOptions = {
			timeZone: "America/New_York",
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		};

		return {
			payPeriodDate: new Intl.DateTimeFormat(
				"en-CA",
				payPeriodDateOptions
			).format(date),
			textDate: new Intl.DateTimeFormat("en-CA", textDateOptions)
				.format(date)
				.split("")
				.filter((char) => char !== ",")
				.join(""),
			numDate: new Intl.DateTimeFormat("en-CA", numDateOptions).format(date),
			time: new Intl.DateTimeFormat("en-CA", timeOptions).format(date),
		};
	};

	const updatePayPeriod = (docId, docData) => {
		return setDoc(doc(db, `clients/${client.code}/timeclock`, docId), docData);
	};

	const updateSchedule = async (client, startDate, endDate) => {
		const tzOffset = new Date().getTimezoneOffset() * 60000;
		const UTCStartDate = new Date(startDate - -tzOffset);
		const UTCEndDate = new Date(endDate - -(864e5 + tzOffset));

		const q = query(
			collection(db, `clients/${client.code}/timeclock`),
			where("clockedIn", ">=", Timestamp.fromDate(UTCStartDate)),
			where("clockedIn", "<", Timestamp.fromDate(UTCEndDate)),
			orderBy("clockedIn", "asc")
		);

		onSnapshot(q, (snap) => {
			setSched(
				snap.docs.map((doc) => {
					const data = doc.data();
					data.docId = doc.id;
					data.hours = data.clockedOut
						? parseFloat(((data.clockedOut - data.clockedIn) / 36e2).toFixed(2)) //fs timestamp seconds
						: parseFloat(
								((new Date() - data.clockedIn.toDate()) / 36e5).toFixed(2) //js date milliseconds
						  );
					return data;
				})
			);
		});
	};

	const getOptions = () => {
		const options = [];
		let startPayDate = new Date(client?.startDate?.toDate());
		while (startPayDate < new Date()) {
			if (payPeriodLength === "biweekly") {
				options.unshift([
					startPayDate.toJSON(),
					new Date(startPayDate - -(twoWksInMs - 864e5)).toJSON(),
				]);
				startPayDate = new Date(startPayDate - -twoWksInMs);
			} else if (payPeriodLength === "monthly") {
				startPayDate.setUTCDate(1);
				const endPayDate = new Date(startPayDate);
				endPayDate.setUTCMonth(endPayDate.getUTCMonth() + 1);
				endPayDate.setUTCDate(endPayDate.getUTCDate() - 1);
				options.unshift([startPayDate.toJSON(), endPayDate.toJSON()]);
				startPayDate.setUTCMonth(startPayDate.getUTCMonth() + 1);
			}
		}
		return options;
	};
	useEffect(() => {
		const options = getOptions();
		setPayPeriods(options);
		setPayPeriod(options[0]);
	}, [client]);
	useEffect(() => {
		if (payPeriod && client)
			updateSchedule(client, new Date(payPeriod[0]), new Date(payPeriod[1]));
	}, [payPeriod, client]);

	return (
		<>
			<div class={style.scheduleNav}>
				<div class={style.scheduleOptions}>
					<div class={style.scheduleOption}>
						<h3>Client:</h3>
						<select
							class={style.scheduleOptionSelect}
							onChange={(e) =>
								setClient(
									clients.find((client) => client.code === e.target.value)
								)
							}
						>
							{clients.map((client) => (
								<option value={client.code}>{client.displayName}</option>
							))}
						</select>
					</div>
					<div class={style.scheduleOption}>
						<h3>Date Range:</h3>
						<select
							class={style.scheduleOptionSelect}
							onChange={(e) => setPayPeriod(e.target.value.split(","))}
						>
							{payPeriods.map((period) => (
								<option value={period} selected={period === payPeriod}>{`${
									formatDateTime(new Date(period[0])).payPeriodDate
								} - ${
									formatDateTime(new Date(period[1])).payPeriodDate
								}`}</option>
							))}
						</select>
					</div>
				</div>
				<div>
					<button class={style.generateBtn} onClick={generateTimesheet}>
						Generate Timesheet
					</button>
				</div>
			</div>
			<div class={style.schedule}>
				<div class={style.clock}>
					<p>Date</p>
					<p>Time</p>
					<p>
						Hours (Total:{" "}
						{sched.reduce((acc, curr) => acc + curr.hours, 0).toFixed(2)})
					</p>
					<p>Notes</p>
				</div>
				{sched.map((clock) => (
					<div class={style.clock}>
						<p>{formatDateTime(clock.clockedIn.toDate()).textDate}</p>
						<p>{`${formatDateTime(clock.clockedIn.toDate()).time}-${
							formatDateTime(clock.clockedOut?.toDate()).time
						}`}</p>
						<p>{clock.hours}</p>
						<p>{clock.notes}</p>
					</div>
				))}
			</div>
		</>
	);
};

export default Schedule;
