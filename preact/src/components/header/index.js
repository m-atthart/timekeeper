import { h } from "preact";
import style from "./style.css";

const Header = ({ currentUser, signIn, clockedIn }) => {
	return (
		<>
			<header class={style.header}>
				<h1>Matt is clocked {clockedIn ? "in" : "out"}</h1>
				<nav>
					<a onClick={signIn}>
						{currentUser ? `Hi, ${currentUser.displayName}` : "Login"}
					</a>
				</nav>
			</header>
			<header class={style.headerSpacing}></header>
		</>
	);
};

export default Header;
