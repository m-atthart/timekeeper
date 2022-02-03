import { h } from "preact";
import style from "./style.css";

const Header = ({ currentUser, signIn }) => {
	return (
		<header class={style.header}>
			<h1>Matt's Time Clock</h1>
			<nav>
				<a onClick={signIn}>
					{currentUser ? `Hi, ${currentUser.displayName}` : "Login"}
				</a>
			</nav>
		</header>
	);
};

export default Header;
