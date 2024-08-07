import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import style from "./style.css";
import {
	collection,
	query,
	where,
	orderBy,
	limit,
	onSnapshot,
	doc,
	getDocs,
	setDoc,
	Timestamp,
} from "firebase/firestore";

const Schedule = ({ db, currentUser, client, setClient, clients }) => {
	const payPeriodLength = client?.payPeriodLength ?? "biweekly";
	const [payPeriodIdx, setPayPeriodIdx] = useState(0);
	const [payPeriods, setPayPeriods] = useState([]);
	const payPeriod = payPeriods[payPeriodIdx];
	const [sched, setSched] = useState([]);

	const generateTimesheet = async (e, exportType) => {
		e.preventDefault();

		const clocks = sched.map((clock) => {
			clock.date = formatDateTime(clock.clockedIn.toDate(), "numDate");
			clock.startTime = formatDateTime(clock.clockedIn.toDate(), "time");
			clock.endTime = formatDateTime(clock.clockedOut?.toDate(), "time");
			return clock;
		});

		clocks.push({
			hours: parseFloat(
				clocks.reduce((acc, curr) => acc + curr.hours, 0).toFixed(2)
			),
		});

		const XLSX = await import("xlsx");
		const wb = XLSX.utils.book_new();
		if (exportType === "timesheet") {
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
		} else if (exportType === "invoice") {
			const ws = {};

			// row 1, columns A-E merged = "FACTURE/INVOICE"
			// row 2 = empty
			// column A, row 3-7 = user name, address, city province postal, number, email
			// D3 = "Date:"
			// E3 = date
			// D4 = "Invoice #:"
			// E4 = invoice number
			// DE5 merged = "Bill to:"
			// E, 6-8, right aligned = client name, address, city province postal
			// A10 = "Date"
			// B10 = "Hours worked"
			// C10 = "Service"
			// ABC = date, hours, service. one per row
			// empty row
			// D = "Total Hours:"
			// E = total hours
			// D = "Rate (per hour): $"
			// E = rate
			// D = "Balance Due: $"
			// E = balance due
			// empty row
			// A-E merged = "Merci! Thank you!"
			// all outside border

			XLSX.utils.book_append_sheet(wb, ws, "Invoice");
			const invoiceNum = payPeriods.length - payPeriodIdx; //not actually invoice number, but idk
			XLSX.writeFile(
				wb,
				`${currentUser?.displayName} - Invoice #${invoiceNum
					.toString()
					.padStart(4, "0")} (${formatDateTime(
					new Date(),
					"invoiceDate"
				)}).xlsx`
			);
		}
	};

	const formatDateTime = (date, formatType) => {
		const options = {
			payPeriodDate: {
				timeZone: "Etc/UTC",
				month: "short",
				day: "numeric",
				year: "numeric",
			},
			textDate: {
				timeZone: "America/New_York",
				weekday: "short",
				month: "short",
				day: "numeric",
				year: "numeric",
			},
			numDate: {
				timeZone: "America/New_York",
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
			},
			time: {
				timeZone: "America/New_York",
				hour: "2-digit",
				minute: "2-digit",
				hourCycle: "h23",
			},
			invoiceDate: {
				timeZone: "America/New_York",
				month: "long",
				day: "numeric",
				year: "numeric",
			},
		};

		switch (formatType) {
			case "payPeriodDate":
				return new Intl.DateTimeFormat("en-CA", options.payPeriodDate).format(
					date
				);
			case "textDate":
				return new Intl.DateTimeFormat("en-CA", options.textDate)
					.format(date)
					.split("")
					.filter((char) => char !== ",")
					.join("");
			case "numDate":
				return new Intl.DateTimeFormat("en-CA", options.numDate).format(date);
			case "time":
				return new Intl.DateTimeFormat("en-CA", options.time).format(date);
			case "invoiceDate":
				return new Intl.DateTimeFormat("en-CA", options.invoiceDate)
					.format(date)
					.split(",")
					.join("");
			default:
				return date.toISOString();
		}
	};

	const updatePayPeriod = (docId, docData) => {
		return setDoc(doc(db, `clients/${client.code}/timeclock`, docId), docData);
	};

	const updateSchedule = async (startDate, endDate) => {
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

	const getPayPeriods = async () => {
		const twoWksInMs = 12096e5;
		const payPeriods = [];
		let startPayDate = new Date(client?.startDate?.toDate());
		while (startPayDate < new Date()) {
			if (payPeriodLength === "biweekly") {
				const endPayDate = new Date(startPayDate - -(twoWksInMs - 864e5));
				payPeriods.unshift([new Date(startPayDate), new Date(endPayDate)]);
				startPayDate = new Date(startPayDate - -twoWksInMs);
			} else if (payPeriodLength === "monthly") {
				startPayDate.setUTCDate(1);
				const endPayDate = new Date(startPayDate);
				endPayDate.setUTCMonth(endPayDate.getUTCMonth() + 1);
				endPayDate.setUTCDate(endPayDate.getUTCDate() - 1);
				payPeriods.unshift([new Date(startPayDate), new Date(endPayDate)]);
				startPayDate.setUTCMonth(startPayDate.getUTCMonth() + 1);
			}
		}

		const payPeriodsFilter = await Promise.all(
			payPeriods.map(async (payPeriod) => {
				const tzOffset = new Date().getTimezoneOffset() * 60000;
				const startDate = new Date(payPeriod[0] - -tzOffset);
				const endDate = new Date(payPeriod[1] - -(864e5 + tzOffset));

				const q = query(
					collection(db, `clients/${client.code}/timeclock`),
					where("clockedIn", ">=", Timestamp.fromDate(startDate)),
					where("clockedIn", "<", Timestamp.fromDate(endDate)),
					limit(1)
				);

				const snap = await getDocs(q);
				return snap.docs.length > 0;
			})
		);

		const filteredPayPeriods = payPeriods
			.filter((_, idx) => payPeriodsFilter[idx])
			.map((payPeriod) => {
				return [payPeriod[0].toJSON(), payPeriod[1].toJSON()];
			});

		return filteredPayPeriods;
	};
	useEffect(() => {
		getPayPeriods().then((payPeriods) => {
			setPayPeriods(payPeriods);
			setPayPeriodIdx(0);
		});
	}, [client]);
	useEffect(() => {
		if (payPeriod && client)
			updateSchedule(new Date(payPeriod[0]), new Date(payPeriod[1]));
	}, [client, payPeriods, payPeriodIdx]);

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
							onChange={(e) => setPayPeriodIdx(e.target.value)}
						>
							{payPeriods.map((period, idx) => (
								<option
									value={idx}
									selected={idx === payPeriodIdx}
								>{`${formatDateTime(
									new Date(period[0]),
									"payPeriodDate"
								)} - ${formatDateTime(
									new Date(period[1]),
									"payPeriodDate"
								)}`}</option>
							))}
						</select>
					</div>
				</div>
				<div>
					<button
						class={style.generateBtn}
						onClick={(e) => generateTimesheet(e, "timesheet")}
					>
						Generate Timesheet
					</button>
					<button
						class={style.generateBtn}
						onClick={(e) => generateTimesheet(e, "invoice")}
					>
						Generate Invoice
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
						<p>{formatDateTime(clock.clockedIn.toDate(), "textDate")}</p>
						<p>{`${formatDateTime(
							clock.clockedIn.toDate(),
							"time"
						)}-${formatDateTime(clock.clockedOut?.toDate(), "time")}`}</p>
						<p>{clock.hours}</p>
						<p>{clock.notes}</p>
					</div>
				))}
			</div>
		</>
	);
};

export default Schedule;
