<section class="hero">
	<h1>QBit<span class="dot">.</span></h1>
	<p class="subtitle">Manage qBittorrent Instances.</p>
</section>

<section class="metrics-grid">
	<div class="metric-card full-width" id="streaming-card">
		<div class="metric-label">qBittorrent Activity</div>
		<div class="library-counts">
			<div class="library-stat">
				<span class="count">-</span>
				<span class="label">Torrents</span>
			</div>
			<div class="library-stat">
				<span class="count">-</span>
				<span class="label">Active</span>
			</div>
			<div class="library-stat">
				<span class="count">-</span>
				<span class="label">Seeding</span>
			</div>
		</div>
		<div class="streaming-activity">
			<div class="activity-stat">
				<i class="fas fa-download"></i> - downloading
			</div>
			<div class="activity-stat">
				<i class="fas fa-upload"></i> - uploading
			</div>
		</div>
	</div>

	<div class="metric-card" id="cpu-card">
		<div class="metric-label">CPU Usage & Temp</div>
		<div class="cpu-main-stats">
			<div class="cpu-usage-value">
				<span class="metric-value" id="cpu-usage">--%</span>
			</div>
			<div class="cpu-temp-value">
				<i class="fas fa-thermometer-half"></i>
				<span id="cpu-temp">--.-°C</span>
			</div>
		</div>
		<div class="progress-bar-container">
			<div class="progress-bar" id="cpu-progress-bar"></div>
		</div>
	</div>

	<div class="metric-card" id="ram-card">
		<div class="metric-label">RAM USAGE</div>
		<div class="card-body">
			<div class="ram-usage-main" id="ram-usage-gb">--.- GB / ---.- GB</div>
			<div class="ram-usage-percent" id="ram-usage-percent">(--.-%)</div>
		</div>
		<div class="progress-bar-container">
			<div class="progress-bar" id="ram-progress-bar"></div>
		</div>
	</div>

	<div class="metric-card" id="docker-card">
		<div class="metric-label">Instances</div>
		<div class="metric-value with-icon">
			<i class="fas fa-server"></i>
			<span id="docker-containers">-</span>
		</div>
		<div class="secondary-stats">
			<div class="stat-item">
				<span>Active</span>
				<span id="docker-images">-</span>
			</div>
			<div class="stat-item">
				<span>Inactive</span>
				<span id="docker-volumes">-</span>
			</div>
		</div>
	</div>

	<div class="metric-card large-card" id="network-card">
		<div class="metric-label">Network Traffic</div>
		<div class="network-current-stats">
			<div class="network-stat">
				<span><i class="fas fa-arrow-down"></i> In</span>
				<span id="net-in">--.- Mb/s</span>
			</div>
			<div class="network-stat">
				<span><i class="fas fa-arrow-up"></i> Out</span>
				<span id="net-out">--.- Mb/s</span>
			</div>
		</div>
		<div class="network-chart-container">
			<canvas id="networkChart"></canvas>
		</div>
	</div>

	<div class="metric-card" id="disk-card">
		<div class="metric-label">Disk Usage</div>
		<div class="card-body">
			<div class="ram-usage-main" id="disk-usage-tb">--.- TB / --.- TB</div>
			<div class="ram-usage-percent" id="disk-usage-percent">(--.-%)</div>
		</div>
		<div class="progress-bar-container">
			<div class="progress-bar" id="disk-progress-bar"></div>
		</div>
	</div>

	<div class="metric-card">
		<div class="metric-label">System Information</div>
		<ul class="sysinfo-list">
			<li><span>OS</span><span>-</span></li>
			<li><span>Kernel</span><span>-</span></li>
			<li><span>CPU</span><span>-</span></li>
		</ul>
	</div>
</section>

<style>
	#streaming-card {
		justify-content: center;
	}

	.library-counts {
		display: flex;
		justify-content: space-around;
		text-align: center;
		flex-grow: 1;
		align-items: center;
		padding: var(--spacing-unit) 0;
	}

	.library-stat .count {
		display: block;
		font-family: var(--font-family-mono);
		font-size: 3rem;
		font-weight: 700;
		line-height: 1.1;
	}

	.library-stat .label {
		font-size: 1rem;
		color: var(--secondary-text-color);
	}

	.streaming-activity {
		display: flex;
		justify-content: space-around;
		border-top: 1px solid var(--border-color);
		padding-top: var(--spacing-unit);
		margin-top: var(--spacing-unit);
		font-family: var(--font-family-mono);
	}

	.activity-stat {
		color: var(--primary-text-color);
		font-size: 1.1rem;
	}

	.network-current-stats {
		display: flex;
		justify-content: space-around;
		font-family: var(--font-family-mono);
		font-size: 1.2rem;
		margin-bottom: var(--spacing-unit);
	}

	.network-stat {
		text-align: center;
	}

	.network-stat span:first-child {
		font-size: 0.8rem;
		color: var(--secondary-text-color);
		text-transform: uppercase;
		display: block;
	}

	.network-stat span:first-child .fas {
		margin-right: 5px;
	}

	.network-stat span:last-child {
		font-weight: 700;
	}

	.network-chart-container {
		position: relative;
		height: 80px;
	}

	#ram-card .card-body {
		align-items: center;
	}

	.ram-usage-main {
		font-family: var(--font-family-mono);
		font-size: 1.5rem;
		font-weight: 700;
		white-space: nowrap;
	}

	.ram-usage-percent {
		font-family: var(--font-family-mono);
		font-size: 1.2rem;
		color: var(--secondary-text-color);
	}

	#disk-card .card-body {
		align-items: center;
	}

	#disk-card .ram-usage-main {
		font-size: 1.7rem;
	}

	#cpu-card .cpu-main-stats {
		align-items: center;
	}

	#docker-card .card-body {
		text-align: center;
	}

	#docker-card .metric-value.with-icon {
		justify-content: center;
		gap: 1.5rem;
		margin-bottom: 0.5rem;
		display: flex;
		align-items: center;
	}

	#docker-card .secondary-stats {
		display: flex;
		flex-direction: row;
		justify-content: center;
		align-items: center;
		gap: 2.5rem;
		margin-top: 1rem;
	}

	.sysinfo-list {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-unit);
		height: 100%;
		justify-content: center;
	}

	.sysinfo-list li {
		display: flex;
		justify-content: space-between;
		font-family: var(--font-family-mono);
		font-size: 1rem;
	}

	.sysinfo-list li span:first-child {
		color: var(--secondary-text-color);
	}

	.sysinfo-list li span:last-child {
		font-weight: 700;
		text-align: right;
	}

	.cpu-main-stats {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		padding-bottom: var(--spacing-unit);
	}

	.cpu-temp-value {
		font-family: var(--font-family-mono);
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--secondary-text-color);
	}

	.cpu-temp-value .fas {
		margin-right: 8px;
		color: var(--accent-color);
	}
</style>
