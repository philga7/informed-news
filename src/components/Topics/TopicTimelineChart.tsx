import { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { TopicTimeline } from '../../types/osint';
import { format } from 'date-fns';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

interface TopicTimelineChartProps {
  timeline: TopicTimeline;
  bucket: 'day' | 'week' | 'month';
  onBucketChange: (bucket: 'day' | 'week' | 'month') => void;
}

export function TopicTimelineChart({ timeline, bucket, onBucketChange }: TopicTimelineChartProps) {
  const [chartData, setChartData] = useState<any>(null);

  useEffect(() => {
    if (!timeline?.timeline?.length) {
      setChartData(null);
      return;
    }

    // Format labels based on bucket
    const labels = timeline.timeline.map((item) => {
      const date = new Date(item.date);
      if (bucket === 'day') {
        return format(date, 'MMM d');
      } else if (bucket === 'week') {
        return format(date, 'MMM d');
      } else {
        return format(date, 'MMM yyyy');
      }
    });

    const data = timeline.timeline.map((item) => item.count);

    // Find index of first mention if available
    let firstMentionIndex = -1;
    if (timeline.firstMention) {
      const firstDate = new Date(timeline.firstMention).toISOString().split('T')[0];
      firstMentionIndex = timeline.timeline.findIndex((item) => {
        const itemDate = new Date(item.date).toISOString().split('T')[0];
        return itemDate === firstDate;
      });
    }

    // Create background colors array (highlight first mention)
    const backgroundColors = data.map((_, index) => {
      if (index === firstMentionIndex) {
        return 'rgba(59, 130, 246, 0.8)'; // blue-500 for first mention
      }
      return 'rgba(120, 113, 108, 0.6)'; // stone-500
    });

    const borderColors = data.map((_, index) => {
      if (index === firstMentionIndex) {
        return 'rgba(59, 130, 246, 1)';
      }
      return 'rgba(120, 113, 108, 0.8)';
    });

    setChartData({
      labels,
      datasets: [
        {
          label: 'Source Records',
          data,
          backgroundColor: backgroundColors,
          borderColor: borderColors,
          borderWidth: 1,
        },
      ],
    });
  }, [timeline, bucket]);

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(28, 25, 23, 0.95)', // stone-900
        titleColor: '#e7e5e4', // stone-200
        bodyColor: '#a8a29e', // stone-400
        borderColor: '#44403c', // stone-700
        borderWidth: 1,
        padding: 12,
        displayColors: false,
        callbacks: {
          title: (context) => {
            const index = context[0].dataIndex;
            const date = timeline.timeline[index].date;
            return format(new Date(date), 'PPP');
          },
          label: (context) => {
            const count = context.parsed.y;
            return `${count} record${count !== 1 ? 's' : ''}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(68, 64, 60, 0.3)', // stone-700 with opacity
          drawBorder: false,
        },
        ticks: {
          color: '#a8a29e', // stone-400
          maxRotation: 45,
          minRotation: 0,
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(68, 64, 60, 0.3)', // stone-700 with opacity
          drawBorder: false,
        },
        ticks: {
          color: '#a8a29e', // stone-400
          precision: 0,
        },
      },
    },
  };

  if (!chartData || !timeline.timeline.length) {
    return (
      <div className="text-center py-12 text-stone-500">
        <p>No timeline data available</p>
      </div>
    );
  }

  return (
    <div>
      {/* Bucket selector */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-stone-300">Activity Over Time</h3>
        <div className="flex gap-2">
          <button
            onClick={() => onBucketChange('day')}
            className={`px-3 py-1 text-sm rounded transition-colors duration-200 ${
              bucket === 'day'
                ? 'bg-accent text-white'
                : 'bg-stone-800 text-stone-400 hover:bg-stone-700'
            }`}
          >
            Day
          </button>
          <button
            onClick={() => onBucketChange('week')}
            className={`px-3 py-1 text-sm rounded transition-colors duration-200 ${
              bucket === 'week'
                ? 'bg-accent text-white'
                : 'bg-stone-800 text-stone-400 hover:bg-stone-700'
            }`}
          >
            Week
          </button>
          <button
            onClick={() => onBucketChange('month')}
            className={`px-3 py-1 text-sm rounded transition-colors duration-200 ${
              bucket === 'month'
                ? 'bg-accent text-white'
                : 'bg-stone-800 text-stone-400 hover:bg-stone-700'
            }`}
          >
            Month
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="h-64">
        <Bar data={chartData} options={options} />
      </div>

      {/* First mention indicator */}
      {timeline.firstMention && (
        <div className="mt-3 text-xs text-stone-500 flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-500 rounded"></div>
          <span>First mention highlighted in blue</span>
        </div>
      )}
    </div>
  );
}

