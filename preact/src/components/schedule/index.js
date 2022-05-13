import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import style from "./style.css";
import {
	collection,
	query,
	where,
	orderBy,
	getDocs,
	Timestamp,
} from "firebase/firestore/lite";
import * as XLSX from "xlsx";

const Schedule = ({ db, client, setClient, clients }) => {
	const initialPayDate = new Date("2022-01-08");
	const twoWksInMs = 12096e5;
	const [payPeriod, setPayPeriod] = useState(null); //empty arr is truthy
	const [payPeriods, setPayPeriods] = useState([]);
	const [sched, setSched] = useState([]);

	const generateTimesheet = (e) => {
		e.preventDefault();

		const clocks = sched.map((clock) => {
			clock.date = clock.clockedIn.toDate().toJSON().split("T")[0];
			clock.startTime = formatTime(clock.clockedIn.toDate());
			clock.endTime = formatTime(clock.clockedOut?.toDate());
			return clock;
		});

		clocks.push({
			hours: parseFloat(
				clocks.reduce((acc, curr) => acc + curr.hours, 0).toFixed(2)
			),
		});

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
			`Matt's Timesheet - ${payPeriod[0].split("T")[0]} - ${
				payPeriod[1].split("T")[0]
			}.xlsx`
		);
	};

	// contains bug: shows next date if clockedIn after 7/8 cause date is UTC
	const formatDate = (date, option = false) => {
		return option
			? date.toString().split(" ").slice(0, 4).join(" ")
			: date.toString().split(" ").slice(1, 4).join(" ");
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

	const updateSchedule = async (client, startDate, endDate) => {
		const q = query(
			collection(db, `clients/${client.code}/timeclock`),
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
		return options;
	};
	useEffect(() => {
		const options = getOptions();
		setPayPeriods(options);
		setPayPeriod(options[0]);
	}, []);
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
								<option value={client.code}>{client.name}</option>
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
								<option
									value={period}
									selected={period === payPeriod}
								>{`${formatDate(new Date(period[0]))} - ${formatDate(
									new Date(period[1])
								)}`}</option>
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
						<p>{formatDate(clock.clockedIn.toDate(), true)}</p>
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
