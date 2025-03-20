// Main app configuration
const config = {
    margin: { top: 120, right: 50, bottom: 120, left: 80 }, // Increased top and bottom margins
    width: 900,
    height: 500,
    transitionDuration: 750,
    colors: d3.schemeCategory10
};

// Initialize the visualization
document.addEventListener('DOMContentLoaded', () => {
    // Load the data
    loadData();
    
    // Removed chart selector event listener since we only have one chart type now
});

// Load and process the CSV data
async function loadData() {
    try {
        // Load your CSV file
        const data = await d3.csv('data/ucd-survey-data.csv');
        
        // Store the processed data
        window.surveyData = processData(data);
        
        // Initialize with the overview visualization directly
        createOverviewChart();
    } catch (error) {
        console.error('Error loading or processing data:', error);
        document.getElementById('chart-area').innerHTML = 
            `<p class="error">Error loading data. Please check console for details.</p>`;
    }
}

// Process the raw CSV data into useful formats
function processData(data) {
    // Create different data structures for visualization
    const questionCounts = {};  // For categorical/multiple-choice questions
    const numericQuestions = {}; // For numeric data questions
    const textResponses = {};   // For free text responses
    
    // First pass - identify question types and initialize structures
    if (data.length > 0) {
        const firstRow = data[0];
        Object.keys(firstRow).forEach(question => {
            // Skip metadata fields like Timestamp, Email, etc.
            if (['Timestamp', 'Email', 'Name'].includes(question)) {
                return;
            }
            
            // Check if question contains numeric data
            const value = firstRow[question];
            if (!isNaN(parseFloat(value)) && isFinite(value)) {
                numericQuestions[question] = [];
            } else {
                questionCounts[question] = {};
                textResponses[question] = [];
            }
        });
    }
    
    // Second pass - aggregate the data
    data.forEach(response => {
        Object.keys(response).forEach(question => {
            const answer = response[question];
            
            // Skip empty answers
            if (!answer || answer.trim() === '') {
                return;
            }
            
            if (numericQuestions.hasOwnProperty(question)) {
                // Handle numeric data
                const numValue = parseFloat(answer);
                if (!isNaN(numValue)) {
                    numericQuestions[question].push(numValue);
                }
            } else if (questionCounts.hasOwnProperty(question)) {
                // Handle categorical data
                
                // Check if this is a multiple-selection response (comma-separated)
                if (answer.includes(',')) {
                    // Split and count each selected option
                    answer.split(',').map(a => a.trim()).forEach(option => {
                        if (option) {
                            questionCounts[question][option] = (questionCounts[question][option] || 0) + 1;
                        }
                    });
                } else {
                    // Single selection response
                    questionCounts[question][answer] = (questionCounts[question][answer] || 0) + 1;
                }
                
                // Also store the full text response
                textResponses[question].push(answer);
            }
        });
    });
    
    // Calculate statistics for numeric questions
    const numericStats = {};
    Object.keys(numericQuestions).forEach(question => {
        const values = numericQuestions[question];
        if (values.length > 0) {
            numericStats[question] = {
                min: d3.min(values),
                max: d3.max(values),
                mean: d3.mean(values),
                median: d3.median(values),
                stdDev: d3.deviation(values),
                values: values // Keep the raw values for histogram generation
            };
        }
    });
    
    // Process time-based data if Timestamp field exists
    let timeData = null;
    if (data.length > 0 && data[0].hasOwnProperty('Timestamp')) {
        const dateParser = d3.timeParse('%Y-%m-%d %H:%M:%S');
        const dateFormatter = d3.timeFormat('%Y-%m-%d');
        
        // Count responses by date
        const responsesByDate = {};
        data.forEach(d => {
            if (d['Timestamp']) {
                const date = dateFormatter(dateParser(d['Timestamp']));
                responsesByDate[date] = (responsesByDate[date] || 0) + 1;
            }
        });
        
        // Convert to array format for visualization
        timeData = Object.entries(responsesByDate)
            .map(([date, count]) => ({
                date: d3.timeParse('%Y-%m-%d')(date),
                count: count
            }))
            .sort((a, b) => a.date - b.date);
    }
    
    return {
        raw: data,
        questionCounts: questionCounts,
        numericStats: numericStats,
        textResponses: textResponses,
        timeData: timeData
    };
}

// Create an overview bar chart - this is now our only visualization
function createOverviewChart() {
    const data = window.surveyData;
    
    // Identify short answer questions to exclude
    const shortAnswerQuestions = [
        "What information did you find most difficult to obtain when researching web developers?",
        "What specific information would make you feel more confident in hiring a web developer?",
        "What would make you immediately exit a web developer's website?",
        "What do you wish web developers better understood about your needs as a client?",
        "What was your biggest concern before hiring a web developer?",
        "How would you prefer to communicate with your developer during a project?",
        "What is your approximate budget range for your website project?",
        "Would you prefer fixed pricing or hourly rates for your web development project?"
    ];
    
    // Get all categorical questions (excluding empty ones, short answers, and other specified questions)
    const validQuestions = Object.keys(data.questionCounts).filter(q => 
        Object.keys(data.questionCounts[q]).length > 0 && 
        q !== 'Username' && 
        !q.includes('Thanks so much for completing this survey') &&
        !q.toLowerCase().includes('rate the importance') &&
        !q.includes('What were your top 3 priorities when selecting a web developer') &&
        !shortAnswerQuestions.includes(q)
    );
    
    if (validQuestions.length === 0) {
        showNoDataMessage();
        return;
    }
    
    // Create question selector
    const selectorId = 'overview-question-selector';
    createQuestionSelector(validQuestions, selectorId, 0, questionKey => {
        renderOverviewChart(questionKey);
    });
    
    // Render the first question by default
    renderOverviewChart(validQuestions[0]);
    
    function renderOverviewChart(questionKey) {
        // Create a new chart container
        const chartContainer = createChartContainer();
        
        // Get response data for selected question
        const responseData = Object.entries(data.questionCounts[questionKey])
            .map(([answer, count]) => ({ answer, count }))
            .sort((a, b) => b.count - a.count);
        
        // Set up the SVG container
        const svg = chartContainer
            .append('svg')
            .attr('width', config.width + config.margin.left + config.margin.right)
            .attr('height', config.height + config.margin.top + config.margin.bottom)
            .append('g')
            .attr('transform', `translate(${config.margin.left},${config.margin.top})`);
        
        // Create scales
        const xScale = d3.scaleBand()
            .domain(responseData.map(d => d.answer))
            .range([0, config.width])
            .padding(0.3);
        
        const yScale = d3.scaleLinear()
            .domain([0, d3.max(responseData, d => d.count) * 1.1])
            .range([config.height, 0]);
        
        // Create and add the axes
        svg.append('g')
            .attr('transform', `translate(0,${config.height})`)
            .call(d3.axisBottom(xScale))
            .selectAll('text')
            .attr('transform', 'rotate(-45)')
            .style('text-anchor', 'end');
        
        svg.append('g')
            .call(d3.axisLeft(yScale));
        
        // Add bars
        svg.selectAll('.bar')
            .data(responseData)
            .enter()
            .append('rect')
            .attr('class', 'bar')
            .attr('x', d => xScale(d.answer))
            .attr('y', config.height)
            .attr('width', xScale.bandwidth())
            .attr('height', 0)
            .attr('fill', (d, i) => config.colors[i % config.colors.length])
            .transition()
            .duration(config.transitionDuration)
            .attr('y', d => yScale(d.count))
            .attr('height', d => config.height - yScale(d.count));
        
        // Add labels and title
        addChartTitle(svg, `Responses to: ${questionKey}`, config.width);
            
        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('y', -60)
            .attr('x', -(config.height / 2))
            .attr('text-anchor', 'middle')
            .text('Number of Responses');
            
        // Add tooltips
        svg.selectAll('.bar')
            .append('title')
            .text(d => `${d.answer}: ${d.count} responses`);
        
        // Add insights
        d3.select('#insights').html('');
        const totalResponses = responseData.reduce((sum, item) => sum + item.count, 0);
        const mostCommon = responseData[0] || { answer: 'None', count: 0 };
        const percentage = ((mostCommon.count / totalResponses) * 100).toFixed(1);
        
        d3.select('#insights')
            .html(`
                <div class="insight-box">
                    <h3>Key Insights</h3>
                    <p>Total responses: <strong>${totalResponses}</strong></p>
                    <p>Most common answer: <strong>${mostCommon.answer}</strong> (${percentage}%)</p>
                    <p>Number of unique answers: <strong>${responseData.length}</strong></p>
                </div>
            `);
    }
}

// Removed createComparisonChart function

// Helper function to create a question selector
function createQuestionSelector(questions, id, defaultIndex, onChangeCallback) {
    // First clear any existing selectors to avoid duplication
    d3.selectAll('.question-selector-container').remove();
    
    // Create a container for the selector above the chart area
    const container = d3.select('#chart-area')
        .insert('div', ':first-child')
        .attr('class', 'question-selector-container');
    
    container.append('label')
        .attr('for', id)
        .text('Select question: ');
    
    // Create the selector
    const selector = container.append('select')
        .attr('id', id)
        .attr('class', 'question-selector');
    
    // Add options with truncated text (only up to the question mark)
    selector.selectAll('option')
        .data(questions)
        .enter()
        .append('option')
        .attr('value', d => d)
        .text(d => {
            // Truncate text at the question mark
            const questionMarkIndex = d.indexOf("?");
            if (questionMarkIndex !== -1) {
                return d.substring(0, questionMarkIndex + 1); // Include the question mark
            }
            return d;
        });
    
    // Set the default selected question
    selector.property('selectedIndex', defaultIndex);
    
    // Add event listener
    selector.on('change', function() {
        const selectedQuestion = this.value;
        onChangeCallback(selectedQuestion);
    });
}

// Create a chart container separate from the selector
function createChartContainer() {
    // Remove any existing chart container
    d3.select('#chart-container').remove();
    
    // Create a new container for the chart
    return d3.select('#chart-area')
        .append('div')
        .attr('id', 'chart-container');
}

// Helper function to show a message when there's no data
function showNoDataMessage(message = "No suitable data found for this visualization") {
    // Create a chart container if it doesn't exist
    const container = d3.select('#chart-container').size() ? 
        d3.select('#chart-container') : 
        createChartContainer();
    
    container.html('') // Clear any existing content
        .append('div')
        .attr('class', 'no-data-message')
        .html(`
            <p>${message}</p>
            <p>Please check your data or try another visualization type.</p>
        `);
}

// Function to create a chart title that wraps if needed
function addChartTitle(svg, title, width) {
    // Remove any existing title
    svg.selectAll('.chart-title').remove();
    
    // Add the title with wrapping capability
    const titleElement = svg.append('text')
        .attr('x', width / 2)
        .attr('y', -20)
        .attr('text-anchor', 'middle')
        .attr('class', 'chart-title')
        .text(title);
    
    // Check if title is too long and needs wrapping
    const titleNode = titleElement.node();
    if (titleNode && titleNode.getComputedTextLength() > width * 0.9) {
        // Split title into multiple lines if too long
        const words = title.split(' ');
        let line = '';
        let lineNumber = 0;
        const lineHeight = 1.1; // ems
        
        titleElement.text(null); // Clear the text
        
        for (let i = 0; i < words.length; i++) {
            const testLine = line + words[i] + ' ';
            const testElem = svg.append('text').text(testLine).attr('class', 'chart-title');
            const testWidth = testElem.node().getComputedTextLength();
            testElem.remove();
            
            if (testWidth > width * 0.9 && i > 0) {
                titleElement.append('tspan')
                    .attr('x', width / 2)
                    .attr('y', -20)
                    .attr('dy', lineNumber * lineHeight + 'em')
                    .text(line);
                line = words[i] + ' ';
                lineNumber++;
            } else {
                line = testLine;
            }
        }
        
        titleElement.append('tspan')
            .attr('x', width / 2)
            .attr('y', -20)
            .attr('dy', lineNumber * lineHeight + 'em')
            .text(line);
        
        // Adjust the transform of the main g element to make space for the wrapped title
        if (lineNumber > 0) {
            const currentTransform = svg.attr('transform');
            const translateY = 20 * (lineNumber + 1);
            if (currentTransform.includes('translate(')) {
                const newTransform = currentTransform.replace(/translate\(([^,]+),([^)]+)\)/, 
                    `translate($1,${parseFloat(RegExp.$2) + translateY})`);
                svg.attr('transform', newTransform);
            }
        }
    }
    
    return titleElement;
}
