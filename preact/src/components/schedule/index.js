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
	getDoc,
	setDoc,
	updateDoc,
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

		const XLSX = await import("xlsx-js-style");
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
			const currentUserData = (
				await getDoc(doc(db, `users/${currentUser?.uid}`))
			).data();

			if (client.invoiceNums.length < payPeriods.length) {
				currentUserData.latestInvoiceNum++;
				client.invoiceNums.push(currentUserData.latestInvoiceNum);

				await updateDoc(doc(db, `users/${currentUser?.uid}`), {
					latestInvoiceNum: currentUserData.latestInvoiceNum,
				});
				await updateDoc(doc(db, `clients/${client.code}`), {
					invoiceNums: client.invoiceNums,
				});
			}
			const invoiceNum = client.invoiceNums[
				payPeriods.length - payPeriodIdx - 1
			]
				.toString()
				.padStart(4, "0");

			const ws = {};
			ws["!cols"] = [...Array(5)].map((_) => ({ wpx: 75 }));
			const numRows = 11 + sched.length + 5;
			ws["!rows"] = [...Array(numRows)].map((_) => ({}));
			ws["!merges"] = [];

			// row 1, columns A-E merged = "FACTURE/INVOICE"
			ws["!merges"].push(XLSX.utils.decode_range("A1:E1"));
			ws["A1"] = {
				v: "FACTURE/INVOICE",
				s: { alignment: { horizontal: "center" } },
			};

			// row 2 = empty
			// column A, row 3-7 = user name, address, city province postal, number, email
			ws["A3"] = { v: currentUserData.displayName };
			ws["A4"] = { v: currentUserData.addressLine1 };
			ws["A5"] = { v: currentUserData.addressLine2 };
			ws["A6"] = { v: currentUserData.email };

			// D3 = "Date:"
			ws["D3"] = { v: "Date:" };
			// E3 = date
			ws["E3"] = {
				v: formatDateTime(new Date(), "textDate"),
				s: { alignment: { horizontal: "right" } },
			};
			// D4 = "Invoice #:"
			ws["D4"] = { v: "Invoice #:" };
			// E4 = invoice number
			ws["E4"] = { v: invoiceNum, s: { alignment: { horizontal: "right" } } };
			// DE5 merged, center aligned = "Bill to:"
			ws["!merges"].push(XLSX.utils.decode_range("D5:E5"));
			ws["D5"] = { v: "Bill to:", s: { alignment: { horizontal: "center" } } };
			// E, 6-8, right aligned = client name, address, city province postal
			ws["E6"] = {
				v: client.invoiceName,
				s: { alignment: { horizontal: "right" } },
			};
			ws["E7"] = {
				v: client.addressLine1,
				s: { alignment: { horizontal: "right" } },
			};
			ws["E8"] = {
				v: client.addressLine2,
				s: { alignment: { horizontal: "right" } },
			};

			// A10 = "Date"
			// B10 = "Hours Worked"
			// C10 = "Service"
			ws["A10"] = { v: "Date" };
			ws["B10"] = { v: "Hours Worked" };
			ws["C10"] = { v: "Service" };
			// ABC = date, hours, service. one per row
			let rowIdx = 11;
			sched.forEach((clock) => {
				ws[`A${rowIdx}`] = {
					v: formatDateTime(clock.clockedIn.toDate(), "textDate"),
				};
				ws[`B${rowIdx}`] = {
					v: clock.hours,
					s: { alignment: { horizontal: "right" } },
				};
				ws["!merges"].push(XLSX.utils.decode_range(`C${rowIdx}:E${rowIdx}`));
				ws[`C${rowIdx}`] = {
					v: clock.notes,
					s: { alignment: { wrapText: true } },
				};

				if (clock.notes.length > 42) {
					ws["!rows"][rowIdx - 1].hpx = 32;
				}

				rowIdx++;
			});
			// empty row
			rowIdx++;

			// D = "Total Hours:"
			ws[`D${rowIdx}`] = {
				v: "Total Hours:",
				s: { alignment: { horizontal: "right" } },
			};
			// E = total hours
			const totalHours = sched
				.reduce((acc, curr) => acc + curr.hours, 0)
				.toFixed(2);
			ws[`E${rowIdx}`] = {
				v: totalHours,
				s: { alignment: { horizontal: "right" } },
			};
			rowIdx++;
			// D = "Rate (per hour): $"
			ws[`D${rowIdx}`] = {
				v: "Rate (per hour): CA$",
				s: { alignment: { horizontal: "right" } },
			};
			// E = rate
			ws[`E${rowIdx}`] = {
				v: client.rate,
				s: { alignment: { horizontal: "right" } },
			};
			rowIdx++;
			// D = "Balance Due: $"
			ws[`D${rowIdx}`] = {
				v: "Balance Due: CA$",
				s: { alignment: { horizontal: "right" } },
			};
			// E = balance due
			ws[`E${rowIdx}`] = {
				v: Math.round(totalHours * client.rate * 100) / 100,
				s: { alignment: { horizontal: "right" } },
			};
			rowIdx++;
			// empty row
			rowIdx++;

			// A-E merged = "Merci! Thank you!"
			ws["!merges"].push(XLSX.utils.decode_range(`A${rowIdx}:E${rowIdx}`));
			ws[`A${rowIdx}`] = {
				v: "Merci! Thank you!",
				s: {
					alignment: { horizontal: "center" },
				},
			};

			// top and bottom border
			["A", "B", "C", "D", "E"].forEach((col) => {
				if (!ws[`${col}1`]) {
					ws[`${col}1`] = { v: "" };
				}
				if (!ws[`${col}${rowIdx}`]) {
					ws[`${col}${rowIdx}`] = { v: "" };
				}
				if (!ws[`${col}1`].s) {
					ws[`${col}1`].s = {};
				}
				if (!ws[`${col}${rowIdx}`].s) {
					ws[`${col}${rowIdx}`].s = {};
				}
				if (!ws[`${col}1`].s.border) {
					ws[`${col}1`].s.border = {};
				}
				if (!ws[`${col}${rowIdx}`].s.border) {
					ws[`${col}${rowIdx}`].s.border = {};
				}
				ws[`${col}1`].s.border.top = {
					style: "thin",
					color: { rgb: "000000" },
				};

				ws[`${col}${rowIdx}`].s.border.bottom = {
					style: "thin",
					color: { rgb: "000000" },
				};
			});
			// left and right border
			for (let i = 1; i <= rowIdx; i++) {
				if (!ws[`A${i}`]) {
					ws[`A${i}`] = { v: "", s: { border: {} } };
				}
				if (!ws[`E${i}`]) {
					ws[`E${i}`] = { v: "", s: { border: {} } };
				}
				if (!ws[`A${i}`].s) {
					ws[`A${i}`].s = { border: {} };
				}
				if (!ws[`E${i}`].s) {
					ws[`E${i}`].s = { border: {} };
				}
				if (!ws[`A${i}`].s.border) {
					ws[`A${i}`].s.border = {};
				}
				if (!ws[`E${i}`].s.border) {
					ws[`E${i}`].s.border = {};
				}
				ws[`E${i}`].s.border.right = {
					style: "thin",
					color: { rgb: "000000" },
				};
				ws[`A${i}`].s.border.left = { style: "thin", color: { rgb: "000000" } };
			}

			// include cells in output
			ws["!ref"] = `A1:E${rowIdx}`;
			console.log(ws);
			Object.keys(ws)
				.filter((key) => !key.startsWith("!"))
				.forEach((key) => {
					if (!ws[key].s) ws[key].s = {};
					ws[key].s.font = {
						sz: 12,
						name: "Calibri",
						color: { rgb: "000000" },
					};
				});

			XLSX.utils.book_append_sheet(wb, ws, "Invoice");
			XLSX.writeFile(
				wb,
				`${currentUser?.displayName} - Invoice #${invoiceNum} (${formatDateTime(
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
