import { h } from "preact";
import style from "./style.css";

const Home = ({ clockedIn, clockInOut, lastClockTime, notes, setNotes }) => {
	return (
		<div class={style.home}>
			<input
				value={notes}
				onInput={(e) => setNotes(e.target.value)}
				placeholder="Notes"
			></input>
			<button
				style={`color:${clockedIn ? "red" : "green"}`}
				onClick={clockInOut}
			>
				Clock {clockedIn ? "out" : "in"}
			</button>
			<p>
				Last Clocked {clockedIn ? "In" : "Out"}: {lastClockTime}
			</p>
		</div>
	);
};

export default Home;
